//! Tauri commands exposed to the frontend via `invoke()`.
//!
//! Most v1 capabilities don't need this file at all — persistence goes
//! through `@tauri-apps/plugin-fs` and file/link opening through
//! `@tauri-apps/plugin-shell`, called directly from
//! `apps/desktop/src/persistence/` and the relevant plugins/* packages
//! (Desing architecture §15, §17). Add a command here only when a future
//! capability genuinely needs native Rust. Register new commands in
//! `lib.rs`'s `tauri::generate_handler![...]` list.

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
