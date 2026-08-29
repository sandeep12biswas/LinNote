// Per Desing architecture §17: "no bespoke native Rust code is required
// for v1" — the plugin registry, canvas core, and PersistenceProvider all
// live in TypeScript (apps/desktop/src/), talking to the OS through
// standard Tauri plugins (fs, shell, opener) rather than custom
// #[tauri::command]s. `commands` stays as the escape hatch for the rare
// case a future capability genuinely needs native Rust — see
// commands/mod.rs and CLAUDE.md's "Data flow / module boundaries" section.
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![commands::greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
