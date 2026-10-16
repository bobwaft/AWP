mod engine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(engine::Engine::default())
        .setup(|app| {
            engine::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![engine::engine_request])
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
