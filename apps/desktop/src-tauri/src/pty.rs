//! PTY terminal. `pty_write` is a UI-only Tauri command: the engine supervisor
//! (engine.rs) never touches this module, so agents have no path to type into a terminal.
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

struct Pty {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct Ptys {
    map: Mutex<HashMap<String, Pty>>,
    next: Mutex<u32>,
}

impl Ptys {
    pub fn kill_all(&self) {
        for (_, mut p) in self.map.lock().unwrap().drain() {
            let _ = p.killer.kill();
        }
    }
}

#[derive(serde::Deserialize)]
pub struct SpawnOpts {
    cwd: Option<String>,
    shell: Option<String>,
    cols: u16,
    rows: u16,
    /// Extra env (e.g. refreshed PATH). Keychain secrets are never injected.
    env: Option<HashMap<String, String>>,
    /// Program to run instead of the shell (e.g. `claude`).
    program: Option<String>,
}

fn default_shell() -> (String, Vec<String>) {
    if cfg!(windows) {
        let has_pwsh = std::process::Command::new("pwsh")
            .args(["-NoProfile", "-Command", "exit"])
            .output()
            .is_ok();
        (
            if has_pwsh { "pwsh" } else { "powershell.exe" }.into(),
            vec![],
        )
    } else {
        (
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into()),
            vec!["-l".into()],
        )
    }
}

/// Splits off the longest valid UTF-8 prefix, leaving a partial trailing char in `buf`.
fn take_utf8(buf: &mut Vec<u8>) -> String {
    let valid = match std::str::from_utf8(buf) {
        Ok(s) => s.len(),
        Err(e) if e.error_len().is_none() => e.valid_up_to(),
        Err(_) => buf.len(), // genuinely invalid bytes: lossy below
    };
    let rest = buf.split_off(valid);
    let out = String::from_utf8_lossy(buf).into_owned();
    *buf = rest;
    out
}

#[tauri::command]
pub fn pty_spawn(app: AppHandle, ptys: State<'_, Ptys>, opts: SpawnOpts) -> Result<String, String> {
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: opts.rows,
            cols: opts.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    let (shell, args) = match opts.program {
        Some(p) => (p, vec![]),
        None => match opts.shell {
            Some(s) => (s, vec![]),
            None => default_shell(),
        },
    };
    let mut cmd = CommandBuilder::new(shell);
    cmd.args(args);
    if let Some(cwd) = opts.cwd {
        cmd.cwd(cwd);
    }
    for (k, v) in opts.env.unwrap_or_default() {
        cmd.env(k, v);
    }
    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let id = {
        let mut n = ptys.next.lock().unwrap();
        *n += 1;
        format!("pty{n}")
    };
    ptys.map.lock().unwrap().insert(
        id.clone(),
        Pty {
            master: pair.master,
            writer,
            killer: child.clone_killer(),
        },
    );

    let tid = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut pending = Vec::new();
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            pending.extend_from_slice(&buf[..n]);
            let s = take_utf8(&mut pending);
            if !s.is_empty() {
                let _ = app.emit(&format!("pty://data/{tid}"), s);
            }
        }
        let code = child.wait().map(|s| s.exit_code() as i32).unwrap_or(-1);
        let _ = app.emit(&format!("pty://exit/{tid}"), code);
    });
    Ok(id)
}

#[tauri::command]
pub fn pty_write(ptys: State<'_, Ptys>, pty_id: String, data: String) -> Result<(), String> {
    let mut map = ptys.map.lock().unwrap();
    let p = map.get_mut(&pty_id).ok_or("no such terminal")?;
    p.writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    p.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(
    ptys: State<'_, Ptys>,
    pty_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let map = ptys.map.lock().unwrap();
    let p = map.get(&pty_id).ok_or("no such terminal")?;
    p.master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(ptys: State<'_, Ptys>, pty_id: String) {
    if let Some(mut p) = ptys.map.lock().unwrap().remove(&pty_id) {
        let _ = p.killer.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_split_keeps_partial_char() {
        let mut buf = "é".as_bytes()[..1].to_vec();
        assert_eq!(take_utf8(&mut buf), "");
        buf.push("é".as_bytes()[1]);
        assert_eq!(take_utf8(&mut buf), "é");
        assert!(buf.is_empty());
    }

    #[test]
    fn invalid_bytes_do_not_stall() {
        let mut buf = vec![0xff, b'a'];
        assert_eq!(take_utf8(&mut buf), "\u{fffd}a");
    }

    #[test]
    fn engine_supervisor_has_no_pty_access() {
        let engine_src = include_str!("engine.rs");
        assert!(
            !engine_src.contains("pty"),
            "engine.rs must not reference the PTY module"
        );
    }
}
