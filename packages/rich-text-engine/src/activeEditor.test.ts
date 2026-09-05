import { beforeEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { clearActiveEditorIfCurrent, getActiveEditor, setActiveEditor } from "./activeEditor";

/** A fake `Editor` — these tests only care about reference identity, never TipTap's real behavior. */
function makeFakeEditor(): Editor {
  return {} as Editor;
}

beforeEach(() => {
  setActiveEditor(null); // isolate this module-level state between tests
});

describe("activeEditor", () => {
  it("is null before anything has ever been set", () => {
    expect(getActiveEditor()).toBeNull();
  });

  it("returns whatever was last set", () => {
    const editor = makeFakeEditor();
    setActiveEditor(editor);
    expect(getActiveEditor()).toBe(editor);
  });

  it("setting a new editor replaces the previous one — never clears on its own", () => {
    const first = makeFakeEditor();
    const second = makeFakeEditor();
    setActiveEditor(first);
    setActiveEditor(second);
    expect(getActiveEditor()).toBe(second);
  });

  it("clearActiveEditorIfCurrent clears the tracker when it matches", () => {
    const editor = makeFakeEditor();
    setActiveEditor(editor);
    clearActiveEditorIfCurrent(editor);
    expect(getActiveEditor()).toBeNull();
  });

  it("clearActiveEditorIfCurrent is a no-op if a different editor is now tracked (out-of-order unmount)", () => {
    const first = makeFakeEditor();
    const second = makeFakeEditor();
    setActiveEditor(first);
    setActiveEditor(second); // second focused after first — first is now stale
    clearActiveEditorIfCurrent(first); // first's own cleanup runs later, e.g. on unmount

    expect(getActiveEditor()).toBe(second); // untouched
  });
});
