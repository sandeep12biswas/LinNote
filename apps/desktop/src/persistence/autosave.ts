// NTA-70 (Phase 8) — the one piece of autosave wiring that's genuinely
// generic, not tied to any one store: "hard flush on window blur/close."
// The debounced-write halves live next to the stores they actually
// write — ../canvas-core/index.ts's `createNotePageAutosave` (NotePage,
// debounced ~800ms) and ../workspace/index.ts's `wireWorkspaceTreeAutosave`
// (tree, flushes immediately, no debounce to flush here) — deliberately
// NOT here: this module (../persistence/) is the one every other module
// depends ON, per its own header comment ("Everything else in the app
// depends on PersistenceProvider") — it must never import FROM
// ../canvas-core or ../workspace itself, or the dependency arrow points
// both ways.

import { getCurrentWindow } from "@tauri-apps/api/window";

export interface Flushable {
  /** Immediately writes every pending debounced write, skipping the wait. */
  flush: () => Promise<void>;
}

/**
 * Intercepts the window's close request, flushes every pending debounced
 * write, then actually closes — via `destroy()`, which (unlike
 * `close()`) does not re-emit `closeRequested`, so this can't loop.
 * Returns the Tauri unlisten function.
 */
export async function wireHardFlushOnClose(...flushables: Flushable[]): Promise<() => void> {
  return getCurrentWindow().onCloseRequested(async (event) => {
    event.preventDefault();
    try {
      await Promise.all(flushables.map((flushable) => flushable.flush()));
    } catch (error) {
      console.error("[autosave] failed to flush pending writes on close", error);
    }
    await getCurrentWindow().destroy();
  });
}
