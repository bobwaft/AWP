mod engine;
mod pty;
mod secrets;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(engine::Engine::default())
        .manage(pty::Ptys::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                use tauri::Manager;
                window.state::<pty::Ptys>().kill_all();
            }
        })
        .setup(|app| {
            engine::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            engine::engine_request,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            secrets::secret_set,
            secrets::secret_delete,
            secrets::accounts_list
        ])
        .run(tauri::generate_context!())
        .expect("error while running AWP");
}

#[cfg(test)]
mod tests {
    #[test]
    fn sanity() {
        assert_eq!(2 + 2, 4);
    }
}
