import { beforeEach, describe, expect, it } from "vitest";
import { createSeedWorkspaceNodes, getNode, useWorkspaceTreeStore } from "../workspace";
import { EMPTY_UNDO_STACK_STATE, useStructuralUndoStore } from "./structuralUndoStack";
import {
  createCreateNodeCommand,
  createDeleteNodeCommand,
  createMoveNodeCommand,
  createRenameNodeCommand,
} from "./workspaceCommands";

function resetStores() {
  useWorkspaceTreeStore.setState({ nodes: createSeedWorkspaceNodes() });
  useStructuralUndoStore.setState({ ...EMPTY_UNDO_STACK_STATE });
}

describe("createCreateNodeCommand", () => {
  beforeEach(resetStores);

  it("returns the would-be node synchronously without touching the store", () => {
    const { node } = createCreateNodeCommand({ parentId: "notebook-1", type: "folder", title: "Archive" });
    expect(node.title).toBe("Archive");
    expect(getNode(useWorkspaceTreeStore.getState().nodes, node.id)).toBeUndefined();
  });

  it("execute adds the node; undo removes it entirely (not just soft-deletes it)", () => {
    const { command, node } = createCreateNodeCommand({ parentId: "notebook-1", type: "folder", title: "Archive" });

    useStructuralUndoStore.getState().execute(command);
    expect(getNode(useWorkspaceTreeStore.getState().nodes, node.id)?.title).toBe("Archive");

    useStructuralUndoStore.getState().undo();
    expect(getNode(useWorkspaceTreeStore.getState().nodes, node.id)).toBeUndefined();
  });

  it("redo reinstates the exact same node (same id) rather than minting a new one", () => {
    const { command, node } = createCreateNodeCommand({ parentId: "notebook-1", type: "folder", title: "Archive" });

    useStructuralUndoStore.getState().execute(command);
    useStructuralUndoStore.getState().undo();
    useStructuralUndoStore.getState().redo();

    const nodes = useWorkspaceTreeStore.getState().nodes;
    expect(nodes.filter((n) => n.title === "Archive")).toHaveLength(1);
    expect(getNode(nodes, node.id)?.title).toBe("Archive");
  });
});

describe("createRenameNodeCommand", () => {
  beforeEach(resetStores);

  it("execute renames the node; undo restores its exact prior title/updatedAt", () => {
    const before = getNode(useWorkspaceTreeStore.getState().nodes, "folder-work")!;
    const command = createRenameNodeCommand("folder-work", "Career");

    useStructuralUndoStore.getState().execute(command);
    expect(getNode(useWorkspaceTreeStore.getState().nodes, "folder-work")?.title).toBe("Career");

    useStructuralUndoStore.getState().undo();
    const restored = getNode(useWorkspaceTreeStore.getState().nodes, "folder-work");
    expect(restored?.title).toBe(before.title);
    expect(restored?.updatedAt).toBe(before.updatedAt);
  });

  it("throws for an unknown node id", () => {
    expect(() => createRenameNodeCommand("missing", "x")).toThrow(/unknown node id/i);
  });
});

describe("createMoveNodeCommand", () => {
  beforeEach(resetStores);

  it("execute reparents the node; undo restores its exact prior parentId/order", () => {
    const before = getNode(useWorkspaceTreeStore.getState().nodes, "folder-projects")!;
    const command = createMoveNodeCommand("folder-projects", "folder-personal");

    useStructuralUndoStore.getState().execute(command);
    expect(getNode(useWorkspaceTreeStore.getState().nodes, "folder-projects")?.parentId).toBe("folder-personal");

    useStructuralUndoStore.getState().undo();
    const restored = getNode(useWorkspaceTreeStore.getState().nodes, "folder-projects");
    expect(restored?.parentId).toBe(before.parentId);
    expect(restored?.order).toBe(before.order);
  });
});

describe("createDeleteNodeCommand", () => {
  beforeEach(resetStores);

  it("execute soft-deletes the node and cascades to descendants; undo restores every affected node's prior trashedAt", () => {
    const command = createDeleteNodeCommand("folder-projects");

    useStructuralUndoStore.getState().execute(command);
    let nodes = useWorkspaceTreeStore.getState().nodes;
    expect(getNode(nodes, "folder-projects")?.trashedAt).not.toBeNull();
    expect(getNode(nodes, "page-roadmap")?.trashedAt).not.toBeNull();
    expect(getNode(nodes, "page-roadmap-q1")?.trashedAt).not.toBeNull();

    useStructuralUndoStore.getState().undo();
    nodes = useWorkspaceTreeStore.getState().nodes;
    expect(getNode(nodes, "folder-projects")?.trashedAt).toBeNull();
    expect(getNode(nodes, "page-roadmap")?.trashedAt).toBeNull();
    expect(getNode(nodes, "page-roadmap-q1")?.trashedAt).toBeNull();
  });

  it("throws for an unknown node id", () => {
    expect(() => createDeleteNodeCommand("missing")).toThrow(/unknown node id/i);
  });
});

describe("undo/redo across multiple structural commands", () => {
  beforeEach(resetStores);

  it("undoes the most recent command first, in LIFO order", () => {
    const rename = createRenameNodeCommand("folder-work", "Career");
    useStructuralUndoStore.getState().execute(rename);
    const move = createMoveNodeCommand("folder-projects", "folder-personal");
    useStructuralUndoStore.getState().execute(move);

    // Undo the move first — the rename should still be in effect.
    useStructuralUndoStore.getState().undo();
    let nodes = useWorkspaceTreeStore.getState().nodes;
    expect(getNode(nodes, "folder-projects")?.parentId).toBe("folder-work");
    expect(getNode(nodes, "folder-work")?.title).toBe("Career");

    // Undo the rename next.
    useStructuralUndoStore.getState().undo();
    nodes = useWorkspaceTreeStore.getState().nodes;
    expect(getNode(nodes, "folder-work")?.title).toBe("Work");
  });
});
