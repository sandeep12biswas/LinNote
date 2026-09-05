// NTA-52 — the workspace tree's own undo/redo command stack, separate
// from the per-page canvas command stack (../canvas-core/index.ts,
// Phase 8/NTA-66's TODO(phase-8)): docs/architecture.md §3's "Structural
// operations (MoveNodeCommand, RenameNodeCommand, DeleteNodeCommand) are
// undoable on a stack separate from the canvas command stack." Create
// joins that list here too (the Jira story's fourth command).
//
// Deliberately shaped like canvas-core's future stack rather than
// something orthogonal, per NTA-52's own scope note, so Phase 8 can
// unify them later: a `Command` is just `{ label, execute, undo }`, kept
// on a bounded linear undo/redo stack (`MAX_ENTRIES`, matching
// canvas-core's own "capped at ~200 entries" TODO). The actual
// Move/Rename/Delete/Create `Command` factories live in
// ./workspaceCommands.ts — this file only owns the generic stack
// mechanics, split the same way ../workspace/index.ts splits pure tree
// operations from its thin zustand wrapper.

import { create } from "zustand";

/** One undoable structural mutation. `execute` both performs the action the first time and replays it on redo. */
export interface Command {
  /** Short human-readable description (e.g. `Rename "Notes" to "Ideas"`) — for future undo/redo menu items. */
  label: string;
  execute: () => void;
  undo: () => void;
}

/** Matches canvas-core's own TODO(phase-8) cap so both stacks bound memory the same way. */
export const MAX_ENTRIES = 200;

export interface UndoStackState {
  undoStack: Command[];
  redoStack: Command[];
}

export const EMPTY_UNDO_STACK_STATE: UndoStackState = { undoStack: [], redoStack: [] };

/** Pushes a just-executed command onto the undo stack, clearing redo (the standard "new action invalidates redo" rule). */
export function pushCommand(state: UndoStackState, command: Command): UndoStackState {
  const undoStack = [...state.undoStack, command];
  if (undoStack.length > MAX_ENTRIES) undoStack.shift();
  return { undoStack, redoStack: [] };
}

/** Pops the most recent undo entry onto the redo stack. `command: null` when there's nothing to undo (state is unchanged). */
export function popUndo(state: UndoStackState): { state: UndoStackState; command: Command | null } {
  if (state.undoStack.length === 0) return { state, command: null };
  const command = state.undoStack[state.undoStack.length - 1];
  return {
    command,
    state: { undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, command] },
  };
}

/** Pops the most recent redo entry back onto the undo stack. `command: null` when there's nothing to redo (state is unchanged). */
export function popRedo(state: UndoStackState): { state: UndoStackState; command: Command | null } {
  if (state.redoStack.length === 0) return { state, command: null };
  const command = state.redoStack[state.redoStack.length - 1];
  return {
    command,
    state: { undoStack: [...state.undoStack, command], redoStack: state.redoStack.slice(0, -1) },
  };
}

interface StructuralUndoState extends UndoStackState {
  /** Runs `command.execute()` and pushes it onto the undo stack. What every structural mutation should go through instead of touching the workspace tree store directly. */
  execute: (command: Command) => void;
  undo: () => void;
  redo: () => void;
}

/**
 * The store `FolderTreePane`/`PageListPane` route every structural
 * mutation through, instead of calling `useWorkspaceTreeStore`'s
 * create/rename/move/delete directly (see ./workspaceCommands.ts for the
 * `Command` factories that wrap those). Read `undoStack.length > 0` /
 * `redoStack.length > 0` for enabled state, same selector style as
 * ../workspace's `useWorkspaceTreeStore`.
 */
export const useStructuralUndoStore = create<StructuralUndoState>((set, get) => ({
  ...EMPTY_UNDO_STACK_STATE,
  execute: (command) => {
    command.execute();
    set((state) => pushCommand(state, command));
  },
  undo: () => {
    const { state, command } = popUndo(get());
    if (!command) return;
    command.undo();
    set(state);
  },
  redo: () => {
    const { state, command } = popRedo(get());
    if (!command) return;
    command.execute();
    set(state);
  },
}));
