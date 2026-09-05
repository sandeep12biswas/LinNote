// NTA-100: the second of the two "New Page" surfaces (see
// FolderTreePane.tsx's own header comment for the first) — a toolbar
// button above the list, targeting whichever folder this pane is
// already showing (`selectedFolderId`, ../store). No component test
// existed for this pane before this ticket (buildPageList's own pure
// logic is covered by ./pageList.test.ts) — scoped to just the new
// behavior, not a retroactive full-coverage pass on the rest of the pane.
//
// Unlike FolderTreePane.tsx's own tests, this button lives outside
// `FixedSizeList` entirely, so it isn't affected by that component's own
// "only row 0 renders at the unmeasured height: 0 this test environment
// leaves things at" limitation.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useNavigationStore } from "../store";
import { createNode, createSeedWorkspaceNodes, getNode, useWorkspaceTreeStore } from "../workspace";
import { EMPTY_UNDO_STACK_STATE, useStructuralUndoStore } from "./structuralUndoStack";
import { PageListPane } from "./PageListPane";

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
  act(() => root!.render(<PageListPane />));
}

function findButton(text: string): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];
  const match = buttons.find((button) => button.textContent === text);
  if (!match) throw new Error(`no <button> with text "${text}"`);
  return match;
}

describe("PageListPane: New Page (NTA-100)", () => {
  it("renders no button at all before a folder is selected", () => {
    mount();
    expect(document.querySelector("button")).toBeNull();
  });

  it('"New Page" creates a page under the currently-selected folder (one that already has pages)', () => {
    useNavigationStore.setState({ selectedFolderId: "folder-work" }); // seed: already has page-meeting-notes + folder-projects
    mount();
    act(() => findButton("New Page").click());

    const created = useWorkspaceTreeStore
      .getState()
      .nodes.find((n) => n.type === "page" && n.title === "New Page" && n.parentId === "folder-work");
    expect(created).toBeDefined();
    expect(useNavigationStore.getState().activePageId).toBe(created?.id);
  });

  it('"New Page" also works in an empty folder (the "No pages here yet." case)', () => {
    const { node: emptyFolder } = createNode(useWorkspaceTreeStore.getState().nodes, {
      parentId: "notebook-1",
      type: "folder",
      title: "Empty",
    });
    useWorkspaceTreeStore.setState((state) => ({ nodes: [...state.nodes, emptyFolder] }));
    useNavigationStore.setState({ selectedFolderId: emptyFolder.id });
    mount();
    expect(document.querySelector(".page-list__empty")).not.toBeNull();

    act(() => findButton("New Page").click());
    const created = useWorkspaceTreeStore
      .getState()
      .nodes.find((n) => n.type === "page" && n.parentId === emptyFolder.id);
    expect(created).toBeDefined();
  });

  it("is undoable — undo removes the created page entirely", () => {
    useNavigationStore.setState({ selectedFolderId: "folder-personal" }); // seed: already has page-groceries
    mount();
    act(() => findButton("New Page").click());

    const created = useWorkspaceTreeStore
      .getState()
      .nodes.find((n) => n.type === "page" && n.title === "New Page" && n.parentId === "folder-personal");
    expect(created).toBeDefined();
    expect(useStructuralUndoStore.getState().undoStack).toHaveLength(1);

    act(() => useStructuralUndoStore.getState().undo());
    expect(getNode(useWorkspaceTreeStore.getState().nodes, created!.id)).toBeUndefined();
  });
});
