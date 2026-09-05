// The canvas command stack — NTA-66 (Phase 8, §13): one linear undo/redo
// stack per *open* page, shared across every plugin's mutating action
// (segment move/resize/content, formatting, file-attachment/youtube-embed
// insert, future ink) — the counterpart to ../shell/structuralUndoStack.ts,
// which that file's own header comment already says this one was
// "deliberately shaped like" in advance: same `Command { label, execute,
// undo }` shape, same `MAX_ENTRIES` cap (NTA-68), same
// push/popUndo/popRedo pure-function split, same zustand wrapper
// convention.
//
// **Scope decided with the user before implementing NTA-66**: this stack
// covers canvas *content* — segments (move/resize/content), file
// attachments and YouTube embeds (insert/move), and (once built) ink —
// per the ticket's own enumerated list ("ink, segment move/resize,
// formatting, inserted elements"). Segment auto-grow height
// (`SegmentLayerHost.handleHeightChange`) is deliberately excluded: it's
// a *measured* value (a `ResizeObserver` reporting how tall the content
// actually rendered), not a user gesture, so it stays a direct
// `updateElement` call, same as before this ticket. Page header
// title/date/alignment edits (`PageHeader.tsx`) are also out of scope —
// not in the ticket's own list, and a single-line `<input>`'s native
// undo already covers that case reasonably.
//
// **Formatting is covered without touching a single `plugins/format-*`
// package.** Every format command (bold, italic, font-color, ...) calls
// `getActiveEditor()?.chain()...run()` (`@linnote/rich-text-engine`),
// which dispatches a TipTap transaction on the segment's *own* editor —
// the exact same editor whose `onUpdate` already flows through
// `SegmentLayer`'s `onContentChange` prop into
// `SegmentLayerHost.handleSegmentContentChange` (this is how bold/italic
// text has always round-tripped into `SegmentBlock.content` — verified
// against the running app, see the `run-desktop` skill's own commit
// history). Routing *that one path* through this stack's content
// coalescer (./coalescer.ts) therefore unifies typing AND every
// formatting plugin's edits into one page-level history, "regardless of
// which plugin produced it" per NTA-66's own wording, with zero changes
// to any `plugins/format-*` package. The one change formatting-side is
// disabling TipTap's own `History` extension
// (`packages/rich-text-engine/src/richTextEditor.ts`) — decided with the
// user — so it doesn't also maintain a second, competing, per-editor
// undo stack alongside this one.
//
// **Ctrl+Z/Ctrl+Shift+Z routing**: ../shell/FolderTreePane.tsx's existing
// global keydown handler (NTA-52) now checks whether a page is open
// (`../store`'s `activePageId`) first, and if so routes to *this*
// stack's `undo`/`redo` instead of the structural one — see that file's
// own updated comment. The Folder Tree pane's own Undo/Redo buttons
// still target the structural stack explicitly and unambiguously,
// regardless of that heuristic; this stack gets its own equivalent
// buttons near the Editor Canvas pane (`../shell/AppShell.tsx`'s
// `CanvasUndoRedoControls`).

import { create } from "zustand";

export interface Command {
  /** Short human-readable description (e.g. `Move segment`, `Edit text`) — for a future undo/redo menu/tooltip. */
  label: string;
  execute: () => void;
  undo: () => void;
}

/** Matches ../shell/structuralUndoStack.ts's own cap (NTA-68) — both stacks bound memory the same way. */
export const MAX_ENTRIES = 200;

export interface UndoStackState {
  undoStack: Command[];
  redoStack: Command[];
}

export const EMPTY_UNDO_STACK_STATE: UndoStackState = { undoStack: [], redoStack: [] };

/** Pushes a command onto the undo stack, clearing redo (the standard "a new action invalidates redo" rule), capped at `MAX_ENTRIES`. */
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

/**
 * Every mounted Host (SegmentLayerHost, FileAttachmentHost,
 * YouTubeEmbedHost) registers a callback here — its own coalescers'
 * combined `flushAll()` (./coalescer.ts) — so `undo`/`redo` below can
 * force any pending, not-yet-committed burst to commit *before* popping
 * the stack. Found necessary by actually driving the app: without this,
 * Ctrl+Z pressed soon after typing (inside the coalescer's ~400ms settle
 * window) popped whatever command was already on the stack instead of
 * the edit the user just made, since that edit hadn't committed yet.
 * A plain module-level `Set`, not store state — it's wiring, not
 * something any consumer needs to react to.
 */
const flushHooks = new Set<() => void>();

/** Registers `flush` to run before every future `undo()`/`redo()`. Returns an unregister function — call it from the registering effect's own cleanup (unmount, or `pageId` changing). */
export function registerFlushHook(flush: () => void): () => void {
  flushHooks.add(flush);
  return () => flushHooks.delete(flush);
}

function flushAllHooks(): void {
  for (const flush of flushHooks) flush();
}

export interface CanvasCommandState extends UndoStackState {
  /** Which page's edits `undoStack`/`redoStack` currently hold — informational (e.g. for a future "reset if stale" assertion), not read by `resetForPage` itself. */
  pageId: string | null;
  /**
   * Runs `command.execute()` immediately, then pushes it — for an atomic
   * action that hasn't happened yet (e.g. inserting a file attachment).
   * Most canvas mutations go through `commit` instead (below) — this one
   * exists for the "not already applied live" case.
   */
  execute: (command: Command) => void;
  /**
   * Pushes `command` WITHOUT calling `execute()` — for a gesture or
   * coalesced edit (drag, typing burst) whose net effect was already
   * applied live by ./coalescer.ts as it happened. Using `execute` here
   * instead would double-apply the mutation.
   */
  commit: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  /** Resets both stacks for a newly-opened page — called by ./CanvasViewport.tsx alongside its own per-page viewport reset. A stack left over from the *previous* open page would let Ctrl+Z on this one undo edits that don't belong to it. */
  resetForPage: (pageId: string) => void;
}

export const useCanvasCommandStore = create<CanvasCommandState>((set, get) => ({
  ...EMPTY_UNDO_STACK_STATE,
  pageId: null,
  execute: (command) => {
    command.execute();
    set((state) => pushCommand(state, command));
  },
  commit: (command) => {
    set((state) => pushCommand(state, command));
  },
  undo: () => {
    // Commit any pending coalesced burst first — see flushAllHooks's own
    // doc comment for why this has to happen before popUndo, not after.
    flushAllHooks();
    const { state, command } = popUndo(get());
    if (!command) return;
    command.undo();
    set(state);
  },
  redo: () => {
    flushAllHooks();
    const { state, command } = popRedo(get());
    if (!command) return;
    command.execute();
    set(state);
  },
  resetForPage: (pageId) => set({ ...EMPTY_UNDO_STACK_STATE, pageId }),
}));
