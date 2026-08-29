// Typed wrappers around Tauri's `invoke()`, for the rare custom
// #[tauri::command] (see src-tauri/src/commands/mod.rs). Most persistence
// and file/link-opening work does NOT go through here in the current
// design — it goes through `../persistence/` (PersistenceProvider, backed
// directly by `@tauri-apps/plugin-fs`) and the relevant plugins/* package
// (backed by `@tauri-apps/plugin-shell`) per docs/architecture.md §15, §17.
// Add a wrapper here only when a new native command is registered.

import { invoke } from "@tauri-apps/api/core";

export async function greet(name: string): Promise<string> {
  return invoke("greet", { name });
}
