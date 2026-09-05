import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_UNDO_STACK_STATE,
  MAX_ENTRIES,
  popRedo,
  popUndo,
  pushCommand,
  registerFlushHook,
  useCanvasCommandStore,
  type Command,
} from "./commandStack";

function makeCommand(label: string): Command & { execute: ReturnType<typeof vi.fn>; undo: ReturnType<typeof vi.fn> } {
  return { label, execute: vi.fn(), undo: vi.fn() };
}

describe("pushCommand", () => {
  it("appends to the undo stack and clears redo", () => {
    const first = makeCommand("first");
    const withFirst = pushCommand(EMPTY_UNDO_STACK_STATE, first);
    const second = makeCommand("second");
    const state = pushCommand({ ...withFirst, redoStack: [makeCommand("stale-redo")] }, second);

    expect(state.undoStack).toEqual([first, second]);
    expect(state.redoStack).toEqual([]);
  });

  it("caps the undo stack at MAX_ENTRIES, dropping the oldest entry", () => {
    let state = EMPTY_UNDO_STACK_STATE;
    const commands = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => makeCommand(`cmd-${i}`));
    for (const command of commands) state = pushCommand(state, command);

    expect(state.undoStack).toHaveLength(MAX_ENTRIES);
    expect(state.undoStack[0].label).toBe("cmd-5"); // the first 5 were pushed out
    expect(state.undoStack[state.undoStack.length - 1].label).toBe(`cmd-${MAX_ENTRIES + 4}`);
  });
});

describe("popUndo / popRedo", () => {
  it("popUndo moves the most recent undo entry onto redo", () => {
    const command = makeCommand("only");
    const withCommand = pushCommand(EMPTY_UNDO_STACK_STATE, command);

    const { state, command: popped } = popUndo(withCommand);

    expect(popped).toBe(command);
    expect(state.undoStack).toEqual([]);
    expect(state.redoStack).toEqual([command]);
  });

  it("popUndo returns command: null and unchanged state when the undo stack is empty", () => {
    const { state, command } = popUndo(EMPTY_UNDO_STACK_STATE);
    expect(command).toBeNull();
    expect(state).toBe(EMPTY_UNDO_STACK_STATE);
  });

  it("popRedo moves the most recent redo entry back onto undo", () => {
    const command = makeCommand("only");
    const afterUndo = popUndo(pushCommand(EMPTY_UNDO_STACK_STATE, command)).state;

    const { state, command: popped } = popRedo(afterUndo);

    expect(popped).toBe(command);
    expect(state.undoStack).toEqual([command]);
    expect(state.redoStack).toEqual([]);
  });

  it("popRedo returns command: null and unchanged state when the redo stack is empty", () => {
    const { state, command } = popRedo(EMPTY_UNDO_STACK_STATE);
    expect(command).toBeNull();
    expect(state).toBe(EMPTY_UNDO_STACK_STATE);
  });
});

describe("useCanvasCommandStore", () => {
  beforeEach(() => {
    useCanvasCommandStore.setState({ ...EMPTY_UNDO_STACK_STATE, pageId: null });
  });

  it("execute() runs the command immediately and pushes it", () => {
    const command = makeCommand("insert");
    useCanvasCommandStore.getState().execute(command);

    expect(command.execute).toHaveBeenCalledTimes(1);
    expect(useCanvasCommandStore.getState().undoStack).toEqual([command]);
  });

  it("commit() pushes without calling execute() — for an already-applied coalesced edit", () => {
    const command = makeCommand("move");
    useCanvasCommandStore.getState().commit(command);

    expect(command.execute).not.toHaveBeenCalled();
    expect(useCanvasCommandStore.getState().undoStack).toEqual([command]);
  });

  it("undo() calls the command's undo() and moves it to redo", () => {
    const command = makeCommand("move");
    useCanvasCommandStore.getState().commit(command);

    useCanvasCommandStore.getState().undo();

    expect(command.undo).toHaveBeenCalledTimes(1);
    expect(useCanvasCommandStore.getState().undoStack).toEqual([]);
    expect(useCanvasCommandStore.getState().redoStack).toEqual([command]);
  });

  it("redo() calls the command's execute() again and moves it back to undo", () => {
    const command = makeCommand("move");
    useCanvasCommandStore.getState().commit(command);
    useCanvasCommandStore.getState().undo();
    command.execute.mockClear();

    useCanvasCommandStore.getState().redo();

    expect(command.execute).toHaveBeenCalledTimes(1);
    expect(useCanvasCommandStore.getState().undoStack).toEqual([command]);
    expect(useCanvasCommandStore.getState().redoStack).toEqual([]);
  });

  it("undo()/redo() on an empty stack do not throw and leave state unchanged", () => {
    expect(() => useCanvasCommandStore.getState().undo()).not.toThrow();
    expect(() => useCanvasCommandStore.getState().redo()).not.toThrow();
    expect(useCanvasCommandStore.getState().undoStack).toEqual([]);
    expect(useCanvasCommandStore.getState().redoStack).toEqual([]);
  });

  it("resetForPage() clears both stacks and records the new pageId", () => {
    useCanvasCommandStore.getState().commit(makeCommand("stale"));

    useCanvasCommandStore.getState().resetForPage("page-2");

    expect(useCanvasCommandStore.getState()).toMatchObject({ undoStack: [], redoStack: [], pageId: "page-2" });
  });

  it("undo() and redo() call every registered flush hook first, so a pending burst commits before the stack is popped", () => {
    const flush = vi.fn(() => {
      // Simulates a coalescer's flushAll() committing a pending burst right when asked.
      useCanvasCommandStore.getState().commit(makeCommand("flushed-in-time"));
    });
    const unregister = registerFlushHook(flush);
    try {
      useCanvasCommandStore.getState().undo();
      expect(flush).toHaveBeenCalledTimes(1);
      // The flushed command was pushed, then immediately popped by this same undo() call.
      expect(useCanvasCommandStore.getState().redoStack.map((c) => c.label)).toEqual(["flushed-in-time"]);

      useCanvasCommandStore.getState().redo();
      expect(flush).toHaveBeenCalledTimes(2);
    } finally {
      unregister();
    }
  });

  it("the function returned by registerFlushHook unregisters it", () => {
    const flush = vi.fn();
    const unregister = registerFlushHook(flush);
    unregister();

    useCanvasCommandStore.getState().undo();

    expect(flush).not.toHaveBeenCalled();
  });
});
