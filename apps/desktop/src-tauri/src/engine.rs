//! Engine supervisor: spawns the sidecar, restarts it on crash, relays JSON-RPC.
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_RESTARTS: usize = 3;
const WINDOW: Duration = Duration::from_secs(60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

type Pending = Arc<Mutex<HashMap<u64, Sender<Value>>>>;

#[derive(Default)]
pub struct Engine {
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    pending: Pending,
    next_id: Mutex<u64>,
}

/// Records a crash at `now`; false once more than MAX_RESTARTS happened within WINDOW.
fn allow_restart(history: &mut VecDeque<Instant>, now: Instant) -> bool {
    history.push_back(now);
    while history
        .front()
        .is_some_and(|t| now.duration_since(*t) > WINDOW)
    {
        history.pop_front();
    }
    history.len() <= MAX_RESTARTS
}

fn spawn_engine(log_dir: &str) -> std::io::Result<Child> {
    // Dev runs the TS source with bun; release runs the bundled binary next to the app exe.
    let mut cmd = if cfg!(debug_assertions) {
        let mut c = Command::new("bun");
        c.arg("run").arg(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../packages/engine/src/main.ts"
        ));
        c
    } else {
        let exe = std::env::current_exe()?;
        let name = if cfg!(windows) {
            "awp-engine.exe"
        } else {
            "awp-engine"
        };
        Command::new(exe.with_file_name(name))
    };
    cmd.env("AWP_LOG_DIR", log_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000); // CREATE_NO_WINDOW
    cmd.spawn()
}

fn emit(app: &AppHandle, method: &str, params: Value) {
    let _ = app.emit(
        "engine://event",
        json!({ "method": method, "params": params }),
    );
}

pub fn start(app: AppHandle) {
    let log_dir = app
        .path()
        .app_data_dir()
        .map(|p| p.join("logs").to_string_lossy().into_owned())
        .unwrap_or_default();
    std::thread::spawn(move || {
        let state = app.state::<Engine>();
        let mut crashes = VecDeque::new();
        let mut first = true;
        loop {
            let mut child = match spawn_engine(&log_dir) {
                Ok(c) => c,
                Err(e) => {
                    emit(&app, "engine.failed", json!({ "reason": e.to_string() }));
                    return;
                }
            };
            *state.stdin.lock().unwrap() = child.stdin.take();
            if !first {
                emit(&app, "engine.restarted", json!({}));
            }
            first = false;
            let stdout = child.stdout.take().unwrap();
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let Ok(msg) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if msg.get("method").is_some() && msg.get("id").is_some() {
                    answer_engine_request(&state, &msg);
                } else if msg.get("method").is_none() {
                    // A response; id:null (unparseable request) matches no caller.
                    if let Some(tx) = msg["id"]
                        .as_u64()
                        .and_then(|id| state.pending.lock().unwrap().remove(&id))
                    {
                        let _ = tx.send(msg);
                    }
                } else {
                    emit(
                        &app,
                        msg["method"].as_str().unwrap_or("unknown"),
                        msg["params"].clone(),
                    );
                }
            }
            let _ = child.wait();
            *state.stdin.lock().unwrap() = None;
            state.pending.lock().unwrap().clear(); // drops senders: callers get an error
            if !allow_restart(&mut crashes, Instant::now()) {
                emit(
                    &app,
                    "engine.failed",
                    json!({ "reason": "engine crashed 3 times in 60 s" }),
                );
                return;
            }
        }
    });
}

/// The engine may call back for secrets only (`secret.get`); anything else is refused.
fn answer_engine_request(state: &Engine, msg: &Value) {
    let reply = match msg["method"].as_str() {
        Some("secret.get") => match msg["params"]["key"].as_str().map(crate::secrets::get) {
            Some(Ok(v)) => json!({ "jsonrpc": "2.0", "id": msg["id"], "result": { "value": v } }),
            Some(Err(e)) => {
                json!({ "jsonrpc": "2.0", "id": msg["id"], "error": { "code": -32000, "message": e } })
            }
            None => {
                json!({ "jsonrpc": "2.0", "id": msg["id"], "error": { "code": -32602, "message": "key required" } })
            }
        },
        _ => {
            json!({ "jsonrpc": "2.0", "id": msg["id"], "error": { "code": -32601, "message": "method not found" } })
        }
    };
    if let Some(w) = state.stdin.lock().unwrap().as_mut() {
        let _ = writeln!(w, "{reply}").and_then(|_| w.flush());
    }
}

/// Sends one JSON-RPC request, returns the full response object (UI interprets result/error).
#[tauri::command]
pub async fn engine_request(
    engine: State<'_, Engine>,
    method: String,
    params: Option<Value>,
) -> Result<Value, String> {
    let (tx, rx) = channel();
    let id = {
        let mut n = engine.next_id.lock().unwrap();
        *n += 1;
        *n
    };
    engine.pending.lock().unwrap().insert(id, tx);
    let line = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
    let sent = match engine.stdin.lock().unwrap().as_mut() {
        Some(w) => writeln!(w, "{line}").and_then(|_| w.flush()).is_ok(),
        None => false,
    };
    if !sent {
        engine.pending.lock().unwrap().remove(&id);
        return Err("engine not running".into());
    }
    let result = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(REQUEST_TIMEOUT))
        .await
        .map_err(|e| e.to_string())?;
    result.map_err(|_| {
        engine.pending.lock().unwrap().remove(&id);
        "engine did not respond".into()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restart_policy_allows_three_crashes_in_a_minute() {
        let mut h = VecDeque::new();
        let t = Instant::now();
        assert!(allow_restart(&mut h, t));
        assert!(allow_restart(&mut h, t));
        assert!(allow_restart(&mut h, t));
        assert!(!allow_restart(&mut h, t));
    }

    #[test]
    fn old_crashes_expire() {
        let mut h = VecDeque::new();
        let t = Instant::now();
        for _ in 0..3 {
            allow_restart(&mut h, t);
        }
        assert!(allow_restart(&mut h, t + WINDOW + Duration::from_secs(1)));
    }
}
