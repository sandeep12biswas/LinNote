// Typed wrappers around Tauri's `invoke()`, so components never call it
// directly. Add one function here per command registered in
// `src-tauri/src/commands/mod.rs` / `lib.rs`'s `generate_handler!` list.

import { invoke } from "@tauri-apps/api/core";

export async function greet(name: string): Promise<string> {
  return invoke("greet", { name });
}

// TODO(phase-1): listNotebooks / createSection / createPage / savePage, etc.
// TODO(phase-4): search(query: string) backed by the FTS5 command.
