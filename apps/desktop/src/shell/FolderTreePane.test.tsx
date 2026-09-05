// NTA-100: "New Page" was missing from the UI entirely — these cover the
// new right-click "New Page" context-menu item (see FolderTreePane.tsx's
// own header comment for why it doesn't `startRename` the way "New
// Folder" does). No component test existed for this pane before this
// ticket (everything else here is covered at the pure-helper level —
// folderTree.test.ts, workspaceCommands.test.ts) — this file is scoped
// to just the new behavior, not a retroactive full-coverage pass on the
// rest of the pane.
//
// react-window's `FixedSizeList` only mounts rows that fall within its
// measured pixel height — this test environment's `ResizeObserver` stub
// (../../vitest.setup.ts) never fires a callback, so the pane stays at
// its initial `{ width: 0, height: 0 }` (./useElementSize.ts) for the
// whole test, which in practice means only `rows[0]` — always the root
// notebook, since `expandedIds` starts empty — ever renders a `.folder-
// tree__row` to right-click. That's enough for these tests: the seeded
// root notebook (`notebook-1`, ../workspace/mockData.ts) is a perfectly
// valid "New Page" target on its own.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useNavigationStore } from "../store";
import { createSeedWorkspaceNodes, getNode, useWorkspaceTreeStore } from "../workspace";
import { FolderTreePane } from "./FolderTreePane";
import { EMPTY_UNDO_STACK_STATE, useStructuralUndoStore } from "./structuralUndoStack";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  useWorkspaceTreeStore.setState({ nodes: createSeedWorkspaceNodes() });
  useStructuralUndoStore.setState({ ...EMPTY_UNDO_STACK_STATE });
  useNavigationStore.setState({ selectedFolderId: null, activePageId: null });
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

function mount(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<FolderTreePane />));
}

function findButton(text: string): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];
  const match = buttons.find((button) => button.textContent === text);
  if (!match) throw new Error(`no <button> with text "${text}"`);
  return match;
}

/** See this file's own header comment on why only the first row is reliably present here. */
function rightClickFirstRow(): void {
  const row = document.querySelector(".folder-tree__row");
  if (!row) throw new Error("no .folder-tree__row rendered");
  act(() => {
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  });
}

function createdPage() {
  return useWorkspaceTreeStore.getState().nodes.find((n) => n.type === "page" && n.title === "New Page");
}

describe("FolderTreePane: New Page (NTA-100)", () => {
  it('right-click → "New Page" creates a page node under the clicked notebook/folder', () => {
    mount();
    rightClickFirstRow();
    act(() => findButton("New Page").click());

    const created = createdPage();
    expect(created).toBeDefined();
    expect(created?.parentId).toBe("notebook-1"); // the clicked row, per this file's header comment
  });

  it("selects the folder and opens the new page immediately (there's no row to rename in place)", () => {
    mount();
    rightClickFirstRow();
    act(() => findButton("New Page").click());

    const created = createdPage();
    expect(useNavigationStore.getState().selectedFolderId).toBe("notebook-1");
    expect(useNavigationStore.getState().activePageId).toBe(created?.id);
  });

  it("closes the context menu after creating", () => {
    mount();
    rightClickFirstRow();
    act(() => findButton("New Page").click());
    expect(document.querySelector(".folder-tree__context-menu")).toBeNull();
  });

  it("is undoable — undo removes the created page entirely", () => {
    mount();
    rightClickFirstRow();
    act(() => findButton("New Page").click());

    const created = createdPage();
    expect(created).toBeDefined();
    expect(useStructuralUndoStore.getState().undoStack).toHaveLength(1);

    act(() => useStructuralUndoStore.getState().undo());
    expect(getNode(useWorkspaceTreeStore.getState().nodes, created!.id)).toBeUndefined();
  });
});
