//! Local storage layer.
//!
//! Per the architecture plan:
//! - `sqlx` + SQLite with FTS5 full-text search
//! - Attachments in `~/.local/share/linnote/attachments/` (XDG on Linux, `%APPDATA%` on Windows)
//! - AES-256-GCM encryption at rest via the `ring` crate
//! - Schema hierarchy: notebooks -> sections -> pages -> blocks
//!
//! Phase 1 (weeks 1-3): bootstrap this schema and basic page CRUD.
//! Phase 4 (week 10): enable FTS5 for full-text search.

pub mod schema;

// TODO(phase-1): open/create the SQLite database under the app's data dir
// (see `tauri::api::path::app_data_dir` / `tauri::Manager::path()`), run
// migrations from `schema.rs`, and expose a connection pool to `commands`.
