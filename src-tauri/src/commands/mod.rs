//! Tauri commands exposed to the frontend via `invoke()`.
//!
//! Keep these thin: validate input, delegate to `db`/`sync`/`ocr`/`ai`,
//! return serializable results. Register new commands in `lib.rs`'s
//! `tauri::generate_handler![...]` list.

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// TODO(phase-1): notebook/section/page CRUD commands backed by `db`.
// TODO(phase-4): search command backed by the FTS5 index.
