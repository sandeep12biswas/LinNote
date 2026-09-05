// NTA-66 (Phase 8): explicit Undo/Redo buttons for the canvas command
// stack (./commandStack.ts) — the counterpart to
// ../shell/FolderTreePane.tsx's own Undo/Redo buttons for the structural
// stack. Exists so a user has an unambiguous, always-available control
// for canvas undo/redo regardless of ../shell/FolderTreePane.tsx's own
// Ctrl+Z routing heuristic (which stack a bare keypress hits depends on
// whether a page is open) — clicking a button always means "this
// specific stack," the same way the structural buttons already do.
//
// Mounted by ../shell/AppShell.tsx next to `BreadcrumbTrail`, only while
// a page is open — same guard as the rest of that pane's page-open JSX.
//
// Labeled "Undo edit"/"Redo edit", not the bare "Undo"/"Redo"
// ../shell/FolderTreePane.tsx's structural buttons already use — found
// necessary by actually driving the app: both button pairs render
// simultaneously once a page is open, so bare "Undo"/"Redo" gives two
// on-screen controls with the exact same accessible name, and anything
// (a screen reader's "find button named Undo", a driver script's
// find-by-text, a user's own memory of which one they meant) can't tell
// them apart.

import { useCanvasCommandStore } from "./commandStack";

export function CanvasUndoRedoControls() {
  const undo = useCanvasCommandStore((state) => state.undo);
  const redo = useCanvasCommandStore((state) => state.redo);
  const canUndo = useCanvasCommandStore((state) => state.undoStack.length > 0);
  const canRedo = useCanvasCommandStore((state) => state.redoStack.length > 0);

  return (
    <div className="canvas-undo-redo">
      <button type="button" disabled={!canUndo} onClick={() => undo()} title="Undo (Ctrl+Z)">
        Undo edit
      </button>
      <button type="button" disabled={!canRedo} onClick={() => redo()} title="Redo (Ctrl+Shift+Z)">
        Redo edit
      </button>
    </div>
  );
}
