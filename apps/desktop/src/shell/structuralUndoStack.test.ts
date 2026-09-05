import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_UNDO_STACK_STATE, popRedo, popUndo, pushCommand, useStructuralUndoStore, type Command } from "./structuralUndoStack";

function makeCommand(label = "test"): { command: Command; execute: ReturnType<typeof vi.fn>; undo: ReturnType<typeof vi.fn> } {
  const execute = vi.fn();
  const undo = vi.fn();
  return { command: { label, execute, undo }, execute, undo };
}

describe("pushCommand", () => {
  it("appends to undoStack and clears redoStack", () => {
    const { command } = makeCommand();
    const state = pushCommand({ undoStack: [], redoStack: [command] }, command);
    expect(state.undoStack).toEqual([command]);
    expect(state.redoStack).toEqual([]);
  });

  it("caps the undo stack at MAX_ENTRIES, dropping the oldest entry", () => {
    let state = EMPTY_UNDO_STACK_STATE;
    const commands = Array.from({ length: 205 }, (_, i) => makeCommand(`cmd-${i}`).command);
    for (const command of commands) state = pushCommand(state, command);

    expect(state.undoStack).toHaveLength(200);
    expect(state.undoStack[0].label).toBe("cmd-5");
    expect(state.undoStack[199].label).toBe("cmd-204");
  });
});

describe("popUndo / popRedo", () => {
  it("popUndo returns null command and unchanged state when the undo stack is empty", () => {
    const result = popUndo(EMPTY_UNDO_STACK_STATE);
    expect(result.command).toBeNull();
    expect(result.state).toBe(EMPTY_UNDO_STACK_STATE);
  });

  it("popUndo moves the top entry from undoStack to redoStack", () => {
    const { command } = makeCommand();
    const result = popUndo({ undoStack: [command], redoStack: [] });
    expect(result.command).toBe(command);
    expect(result.state).toEqual({ undoStack: [], redoStack: [command] });
  });

  it("popRedo returns null command and unchanged state when the redo stack is empty", () => {
    const result = popRedo(EMPTY_UNDO_STACK_STATE);
    expect(result.command).toBeNull();
    expect(result.state).toBe(EMPTY_UNDO_STACK_STATE);
  });

  it("popRedo moves the top entry from redoStack back to undoStack", () => {
    const { command } = makeCommand();
    const result = popRedo({ undoStack: [], redoStack: [command] });
    expect(result.command).toBe(command);
    expect(result.state).toEqual({ undoStack: [command], redoStack: [] });
  });
});

describe("useStructuralUndoStore", () => {
  beforeEach(() => {
    useStructuralUndoStore.setState({ ...EMPTY_UNDO_STACK_STATE });
  });

  it("execute runs the command and pushes it onto the undo stack", () => {
    const { command, execute } = makeCommand();
    useStructuralUndoStore.getState().execute(command);

    expect(execute).toHaveBeenCalledOnce();
    expect(useStructuralUndoStore.getState().undoStack).toEqual([command]);
    expect(useStructuralUndoStore.getState().redoStack).toEqual([]);
  });

  it("undo calls the command's undo() and moves it to the redo stack", () => {
    const { command, undo } = makeCommand();
    useStructuralUndoStore.setState({ undoStack: [command], redoStack: [] });

    useStructuralUndoStore.getState().undo();

    expect(undo).toHaveBeenCalledOnce();
    expect(useStructuralUndoStore.getState().undoStack).toEqual([]);
    expect(useStructuralUndoStore.getState().redoStack).toEqual([command]);
  });

  it("undo is a no-op when the undo stack is empty", () => {
    expect(() => useStructuralUndoStore.getState().undo()).not.toThrow();
    expect(useStructuralUndoStore.getState().undoStack).toEqual([]);
  });

  it("redo replays the command's execute() and moves it back to the undo stack", () => {
    const { command, execute } = makeCommand();
    useStructuralUndoStore.setState({ undoStack: [], redoStack: [command] });

    useStructuralUndoStore.getState().redo();

    expect(execute).toHaveBeenCalledOnce();
    expect(useStructuralUndoStore.getState().undoStack).toEqual([command]);
    expect(useStructuralUndoStore.getState().redoStack).toEqual([]);
  });

  it("redo is a no-op when the redo stack is empty", () => {
    expect(() => useStructuralUndoStore.getState().redo()).not.toThrow();
    expect(useStructuralUndoStore.getState().redoStack).toEqual([]);
  });

  it("executing a new command after an undo clears the redo stack", () => {
    const first = makeCommand("first");
    const second = makeCommand("second");

    useStructuralUndoStore.getState().execute(first.command);
    useStructuralUndoStore.getState().undo();
    expect(useStructuralUndoStore.getState().redoStack).toEqual([first.command]);

    useStructuralUndoStore.getState().execute(second.command);
    expect(useStructuralUndoStore.getState().redoStack).toEqual([]);
    expect(useStructuralUndoStore.getState().undoStack).toEqual([second.command]);
  });
});
