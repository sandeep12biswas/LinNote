import { generateKeyBetween } from "fractional-indexing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistenceProvider } from "../persistence";
import type { WorkspaceNode } from "../types";
import {
  TRASH_RETENTION_DAYS,
  createNode,
  deleteNode,
  emptyTrash,
  getAncestorChain,
  getChildren,
  getDescendantIds,
  getNode,
  getRootNodes,
  getTrashedNodes,
  isSelfOrDescendant,
  loadWorkspaceTree,
  moveNode,
  needsRebalance,
  purgeExpiredTrash,
  purgeNode,
  REBALANCE_KEY_LENGTH_THRESHOLD,
  rebalanceSiblings,
  renameNode,
  restoreNode,
  useWorkspaceTreeStore,
  wireWorkspaceTreeAutosave,
} from "./index";
import { createSeedWorkspaceNodes } from "./mockData";

/** A fake `PersistenceProvider` — only `readTree`/`writeTree` are exercised by this file's own tests, the rest just need to satisfy the type. */
function makeFakePersistence(overrides: Partial<PersistenceProvider> = {}): PersistenceProvider {
  return {
    readTree: vi.fn(async () => []),
    writeTree: vi.fn(async () => {}),
    readPage: vi.fn(async () => {
      throw new Error("not used by this test");
    }),
    writePage: vi.fn(async () => {}),
    deletePage: vi.fn(async () => {}),
    readAsset: vi.fn(async () => new Blob()),
    writeAsset: vi.fn(async () => {}),
    readPluginSettings: vi.fn(async () => ({})),
    writePluginSettings: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeNode(fields: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id" | "parentId" | "type">): WorkspaceNode {
  return {
    title: fields.id,
    order: "a0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    trashedAt: null,
    ...fields,
  };
}

describe("getChildren / getRootNodes", () => {
  it("returns only direct children of the given parentId, sorted by order", () => {
    const nodes = [
      makeNode({ id: "b", parentId: "root", type: "folder", order: "a1" }),
      makeNode({ id: "a", parentId: "root", type: "folder", order: "a0" }),
      makeNode({ id: "grandchild", parentId: "b", type: "folder", order: "a0" }),
    ];

    expect(getChildren(nodes, "root").map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("excludes trashed nodes by default, includes them with includeTrashed: true", () => {
    const nodes = [
      makeNode({ id: "a", parentId: "root", type: "folder", order: "a0" }),
      makeNode({ id: "b", parentId: "root", type: "folder", order: "a1", trashedAt: "2026-01-02T00:00:00.000Z" }),
    ];

    expect(getChildren(nodes, "root").map((n) => n.id)).toEqual(["a"]);
    expect(getChildren(nodes, "root", { includeTrashed: true }).map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("getRootNodes returns nodes with parentId === null", () => {
    const nodes = [
      makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0" }),
      makeNode({ id: "folder", parentId: "notebook", type: "folder", order: "a0" }),
    ];

    expect(getRootNodes(nodes).map((n) => n.id)).toEqual(["notebook"]);
  });
});

describe("getNode / getDescendantIds / isSelfOrDescendant", () => {
  const nodes = [
    makeNode({ id: "root", parentId: null, type: "notebook", order: "a0" }),
    makeNode({ id: "child", parentId: "root", type: "folder", order: "a0" }),
    makeNode({ id: "grandchild", parentId: "child", type: "page", order: "a0" }),
    makeNode({ id: "sibling", parentId: "root", type: "folder", order: "a1" }),
  ];

  it("getNode finds a node by id, undefined for an unknown id", () => {
    expect(getNode(nodes, "child")?.id).toBe("child");
    expect(getNode(nodes, "missing")).toBeUndefined();
  });

  it("getDescendantIds returns every nested descendant, not the node itself", () => {
    expect(getDescendantIds(nodes, "root").sort()).toEqual(["child", "grandchild", "sibling"]);
    expect(getDescendantIds(nodes, "child")).toEqual(["grandchild"]);
    expect(getDescendantIds(nodes, "grandchild")).toEqual([]);
  });

  it("isSelfOrDescendant is true for the node itself and any descendant, false otherwise", () => {
    expect(isSelfOrDescendant(nodes, "root", "root")).toBe(true);
    expect(isSelfOrDescendant(nodes, "root", "grandchild")).toBe(true);
    expect(isSelfOrDescendant(nodes, "root", "sibling")).toBe(true);
    expect(isSelfOrDescendant(nodes, "child", "sibling")).toBe(false);
  });
});

describe("getAncestorChain", () => {
  const nodes = [
    makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0" }),
    makeNode({ id: "folder", parentId: "notebook", type: "folder", order: "a0" }),
    makeNode({ id: "page", parentId: "folder", type: "page", order: "a0" }),
    makeNode({ id: "subpage", parentId: "page", type: "page", order: "a0" }),
  ];

  it("returns the chain from the root notebook down to the node itself, inclusive", () => {
    expect(getAncestorChain(nodes, "subpage").map((n) => n.id)).toEqual(["notebook", "folder", "page", "subpage"]);
  });

  it("returns just the node itself for a root-level notebook", () => {
    expect(getAncestorChain(nodes, "notebook").map((n) => n.id)).toEqual(["notebook"]);
  });

  it("returns an empty array for an unknown id", () => {
    expect(getAncestorChain(nodes, "missing")).toEqual([]);
  });
});

describe("createNode", () => {
  it("appends a new node as the last sibling, with a fresh id and timestamps", () => {
    const nodes = [makeNode({ id: "a", parentId: "root", type: "folder", order: "a0" })];

    const { nodes: next, node } = createNode(nodes, { parentId: "root", type: "folder", title: "New Folder" });

    expect(next).toHaveLength(2);
    expect(node.parentId).toBe("root");
    expect(node.type).toBe("folder");
    expect(node.title).toBe("New Folder");
    expect(node.id).not.toBe("a");
    expect(node.trashedAt).toBeNull();
    // Sorts after the existing sibling.
    expect(getChildren(next, "root").map((n) => n.id)).toEqual(["a", node.id]);
  });

  it("works for the first child of a brand-new parent", () => {
    const { node } = createNode([], { parentId: null, type: "notebook", title: "First Notebook" });
    expect(node.parentId).toBeNull();
    expect(node.order).toBeTruthy();
  });
});

describe("renameNode", () => {
  it("updates only title and updatedAt, leaving everything else untouched", () => {
    const nodes = [makeNode({ id: "a", parentId: "root", type: "folder", order: "a0", title: "Old" })];
    const next = renameNode(nodes, "a", "New Title");

    expect(next[0].title).toBe("New Title");
    expect(next[0].id).toBe("a");
    expect(next[0].parentId).toBe("root");
    expect(next[0].order).toBe("a0");
  });

  it("throws for an unknown id", () => {
    expect(() => renameNode([], "missing", "x")).toThrow(/unknown node id/i);
  });
});

describe("moveNode", () => {
  const baseNodes = [
    makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0" }),
    makeNode({ id: "folderA", parentId: "notebook", type: "folder", order: "a0" }),
    makeNode({ id: "folderB", parentId: "notebook", type: "folder", order: "a1" }),
    makeNode({ id: "subfolder", parentId: "folderA", type: "folder", order: "a0" }),
  ];

  it("reparents a node — only parentId/order/updatedAt change (O(1) metadata write)", () => {
    const next = moveNode(baseNodes, "subfolder", "folderB");
    const moved = getNode(next, "subfolder") as WorkspaceNode;

    expect(moved.parentId).toBe("folderB");
    expect(moved.id).toBe("subfolder");
    expect(moved.type).toBe("folder");
    expect(getChildren(next, "folderB").map((n) => n.id)).toEqual(["subfolder"]);
    expect(getChildren(next, "folderA")).toEqual([]);
  });

  it("refuses to move a node into itself", () => {
    expect(() => moveNode(baseNodes, "folderA", "folderA")).toThrow(/itself or one of its own descendants/i);
  });

  it("refuses to move a node into its own descendant", () => {
    expect(() => moveNode(baseNodes, "folderA", "subfolder")).toThrow(/itself or one of its own descendants/i);
  });

  it("refuses to give a notebook a non-null parent", () => {
    expect(() => moveNode(baseNodes, "notebook", "folderA")).toThrow(/must stay root-level/i);
  });

  it("moving a notebook to root (null) is a no-op-shaped call that stays valid", () => {
    const next = moveNode(baseNodes, "folderA", null);
    expect(getNode(next, "folderA")?.parentId).toBeNull();
  });

  it("inserts before a given sibling when beforeSiblingId is provided", () => {
    const nodes = [
      makeNode({ id: "target", parentId: "notebook", type: "folder", order: "a0" }),
      makeNode({ id: "first", parentId: "root", type: "folder", order: "a0" }),
      makeNode({ id: "second", parentId: "root", type: "folder", order: "a1" }),
    ];

    const next = moveNode(nodes, "target", "root", { beforeSiblingId: "second" });

    expect(getChildren(next, "root").map((n) => n.id)).toEqual(["first", "target", "second"]);
  });

  it("reorders within the same parent — dragging the last sibling to the front", () => {
    const nodes = [
      makeNode({ id: "a", parentId: "root", type: "folder", order: "a0" }),
      makeNode({ id: "b", parentId: "root", type: "folder", order: "a1" }),
      makeNode({ id: "c", parentId: "root", type: "folder", order: "a2" }),
    ];

    const next = moveNode(nodes, "c", "root", { beforeSiblingId: "a" });

    expect(getChildren(next, "root").map((n) => n.id)).toEqual(["c", "a", "b"]);
    // Only the moved node's parentId/order/updatedAt change.
    expect(getNode(next, "a")).toEqual(getNode(nodes, "a"));
    expect(getNode(next, "b")).toEqual(getNode(nodes, "b"));
  });

  it("reorders within the same parent — dragging a middle sibling to between two others", () => {
    const nodes = [
      makeNode({ id: "a", parentId: "root", type: "folder", order: "a0" }),
      makeNode({ id: "b", parentId: "root", type: "folder", order: "a1" }),
      makeNode({ id: "c", parentId: "root", type: "folder", order: "a2" }),
      makeNode({ id: "d", parentId: "root", type: "folder", order: "a3" }),
    ];

    // Move "d" to sit between "a" and "b" (i.e. before "b").
    const next = moveNode(nodes, "d", "root", { beforeSiblingId: "b" });

    expect(getChildren(next, "root").map((n) => n.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("dropping with no beforeSiblingId among current siblings appends to the end (drop-after-last)", () => {
    const nodes = [
      makeNode({ id: "a", parentId: "root", type: "folder", order: "a0" }),
      makeNode({ id: "b", parentId: "root", type: "folder", order: "a1" }),
    ];

    const next = moveNode(nodes, "a", "root", {});

    expect(getChildren(next, "root").map((n) => n.id)).toEqual(["b", "a"]);
  });
});

describe("needsRebalance / rebalanceSiblings", () => {
  it("needsRebalance is false for ordinary short keys, true past the threshold", () => {
    expect(needsRebalance("a0")).toBe(false);
    expect(needsRebalance("a".repeat(REBALANCE_KEY_LENGTH_THRESHOLD))).toBe(false);
    expect(needsRebalance("a".repeat(REBALANCE_KEY_LENGTH_THRESHOLD + 1))).toBe(true);
  });

  it("rebalanceSiblings regenerates every direct child's order, preserving relative order", () => {
    const nodes = [
      makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0" }),
      makeNode({ id: "b", parentId: "notebook", type: "folder", order: "z9999" }),
      makeNode({ id: "a", parentId: "notebook", type: "folder", order: "a0000001" }),
      makeNode({ id: "c", parentId: "notebook", type: "folder", order: "z99991" }),
      // A grandchild under a different parent must be untouched.
      makeNode({ id: "grandchild", parentId: "a", type: "folder", order: "a0" }),
    ];

    const next = rebalanceSiblings(nodes, "notebook");

    // Same order (sorted by the *old* keys) is preserved with fresh, short keys.
    expect(getChildren(next, "notebook").map((n) => n.id)).toEqual(["a", "b", "c"]);
    for (const id of ["a", "b", "c"]) {
      expect(needsRebalance(getNode(next, id)?.order as string)).toBe(false);
    }
    // Untouched siblings elsewhere in the tree keep their own order.
    expect(getNode(next, "grandchild")?.order).toBe("a0");
  });

  it("rebalanceSiblings on an empty parent is a no-op", () => {
    const nodes = [makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0" })];
    expect(rebalanceSiblings(nodes, "notebook")).toEqual(nodes);
  });

  it("moveNode automatically rebalances once the naive generated key would grow past the threshold", () => {
    // Manually squeeze two bounds together (mirrors what many same-gap
    // drag-reorders do over time) until the *next* key generated between
    // them would exceed REBALANCE_KEY_LENGTH_THRESHOLD.
    let upper = "a1";
    let candidate = generateKeyBetween("a0", upper);
    while (candidate.length <= REBALANCE_KEY_LENGTH_THRESHOLD) {
      upper = candidate;
      candidate = generateKeyBetween("a0", upper);
    }

    const nodes = [
      makeNode({ id: "a", parentId: "root", type: "folder", order: "a0" }),
      makeNode({ id: "b", parentId: "root", type: "folder", order: upper }),
      makeNode({ id: "c", parentId: "root", type: "folder", order: "a2" }),
    ];

    // Insert "c" between "a" and the squeezed "b": the naive key would
    // cross the threshold, so this should trigger an automatic rebalance
    // of every sibling under "root" rather than growing further.
    const next = moveNode(nodes, "c", "root", { beforeSiblingId: "b" });

    expect(getChildren(next, "root").map((n) => n.id)).toEqual(["a", "c", "b"]);
    for (const node of getChildren(next, "root")) {
      expect(needsRebalance(node.order)).toBe(false);
    }
  });
});

describe("deleteNode", () => {
  it("soft-deletes the node and cascades trashedAt to every descendant in one pass", () => {
    const nodes = [
      makeNode({ id: "root", parentId: null, type: "notebook", order: "a0" }),
      makeNode({ id: "child", parentId: "root", type: "folder", order: "a0" }),
      makeNode({ id: "grandchild", parentId: "child", type: "page", order: "a0" }),
      makeNode({ id: "sibling", parentId: "root", type: "folder", order: "a1" }),
    ];

    const next = deleteNode(nodes, "child");

    expect(getNode(next, "child")?.trashedAt).not.toBeNull();
    expect(getNode(next, "grandchild")?.trashedAt).not.toBeNull();
    expect(getNode(next, "sibling")?.trashedAt).toBeNull();
    // Trashed nodes vanish from default (non-includeTrashed) listings.
    expect(getChildren(next, "root").map((n) => n.id)).toEqual(["sibling"]);
  });
});

describe("getTrashedNodes", () => {
  const nodes = [
    makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0", title: "Notebook" }),
    makeNode({
      id: "folder",
      parentId: "notebook",
      type: "folder",
      order: "a0",
      title: "Folder",
      trashedAt: "2026-01-01T00:00:00.000Z",
    }),
    makeNode({
      id: "page",
      parentId: "folder",
      type: "page",
      order: "a0",
      title: "Page",
      trashedAt: "2026-01-01T00:00:00.000Z",
    }),
    makeNode({
      id: "standalone",
      parentId: "notebook",
      type: "folder",
      order: "a1",
      title: "Standalone",
      trashedAt: "2026-01-03T00:00:00.000Z",
    }),
  ];

  it("returns only trash roots — trashed nodes whose parent isn't itself trashed — newest first", () => {
    expect(getTrashedNodes(nodes).map((n) => n.id)).toEqual(["standalone", "folder"]);
  });
});

describe("restoreNode", () => {
  const nodes = [
    makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0" }),
    makeNode({
      id: "folder",
      parentId: "notebook",
      type: "folder",
      order: "a0",
      trashedAt: "2026-01-01T00:00:00.000Z",
    }),
    makeNode({
      id: "page",
      parentId: "folder",
      type: "page",
      order: "a0",
      trashedAt: "2026-01-01T00:00:00.000Z",
    }),
  ];

  it("clears trashedAt on the node and cascades the restore to every descendant", () => {
    const next = restoreNode(nodes, "folder");
    expect(getNode(next, "folder")?.trashedAt).toBeNull();
    expect(getNode(next, "page")?.trashedAt).toBeNull();
  });

  it("is a no-op when the node isn't currently trashed", () => {
    expect(restoreNode(nodes, "notebook")).toBe(nodes);
  });
});

describe("purgeNode", () => {
  const nodes = [
    makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0" }),
    makeNode({
      id: "folder",
      parentId: "notebook",
      type: "folder",
      order: "a0",
      trashedAt: "2026-01-01T00:00:00.000Z",
    }),
    makeNode({
      id: "page",
      parentId: "folder",
      type: "page",
      order: "a0",
      trashedAt: "2026-01-01T00:00:00.000Z",
    }),
  ];

  it("permanently removes the node and its descendants", () => {
    const next = purgeNode(nodes, "folder");
    expect(getNode(next, "folder")).toBeUndefined();
    expect(getNode(next, "page")).toBeUndefined();
    expect(getNode(next, "notebook")).toBeDefined();
  });

  it("refuses to purge a node that isn't trashed", () => {
    expect(() => purgeNode(nodes, "notebook")).toThrow(/not in the trash/i);
  });

  it("throws for an unknown id", () => {
    expect(() => purgeNode(nodes, "missing")).toThrow(/unknown node id/i);
  });
});

describe("emptyTrash", () => {
  it("removes every currently-trashed node, roots and cascaded descendants alike", () => {
    const nodes = [
      makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0" }),
      makeNode({
        id: "folder",
        parentId: "notebook",
        type: "folder",
        order: "a0",
        trashedAt: "2026-01-01T00:00:00.000Z",
      }),
      makeNode({
        id: "page",
        parentId: "folder",
        type: "page",
        order: "a0",
        trashedAt: "2026-01-01T00:00:00.000Z",
      }),
    ];

    const next = emptyTrash(nodes);
    expect(next.map((n) => n.id)).toEqual(["notebook"]);
  });
});

describe("purgeExpiredTrash", () => {
  const now = new Date("2026-03-01T00:00:00.000Z");

  it(`purges a trash root older than ${TRASH_RETENTION_DAYS} days, along with its descendants`, () => {
    const nodes = [
      makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0" }),
      makeNode({
        id: "old-folder",
        parentId: "notebook",
        type: "folder",
        order: "a0",
        trashedAt: "2026-01-01T00:00:00.000Z", // well past 30 days before `now`
      }),
      makeNode({
        id: "old-page",
        parentId: "old-folder",
        type: "page",
        order: "a0",
        trashedAt: "2026-01-01T00:00:00.000Z",
      }),
      makeNode({
        id: "recent-folder",
        parentId: "notebook",
        type: "folder",
        order: "a1",
        trashedAt: "2026-02-28T00:00:00.000Z", // within 30 days of `now`
      }),
    ];

    const next = purgeExpiredTrash(nodes, { now });
    expect(next.map((n) => n.id)).toEqual(["notebook", "recent-folder"]);
  });

  it("respects a custom retentionDays", () => {
    const nodes = [
      makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0" }),
      makeNode({
        id: "folder",
        parentId: "notebook",
        type: "folder",
        order: "a0",
        trashedAt: "2026-02-27T00:00:00.000Z",
      }),
    ];

    expect(purgeExpiredTrash(nodes, { now, retentionDays: 1 }).map((n) => n.id)).toEqual(["notebook"]);
    expect(purgeExpiredTrash(nodes, { now, retentionDays: 30 }).map((n) => n.id)).toEqual(["notebook", "folder"]);
  });

  it("is a no-op when nothing is trashed or expired", () => {
    const nodes = [makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0" })];
    expect(purgeExpiredTrash(nodes, { now })).toBe(nodes);
  });
});

describe("useWorkspaceTreeStore", () => {
  beforeEach(() => {
    useWorkspaceTreeStore.setState({ nodes: createSeedWorkspaceNodes() });
  });

  it("starts seeded with the mock dataset", () => {
    expect(useWorkspaceTreeStore.getState().nodes.length).toBeGreaterThan(0);
    expect(getRootNodes(useWorkspaceTreeStore.getState().nodes).map((n) => n.id)).toEqual(["notebook-1"]);
  });

  it("createNode/renameNode/moveNode/deleteNode mutate the store's nodes array", () => {
    const { createNode: create, renameNode: rename, moveNode: move, deleteNode: remove } =
      useWorkspaceTreeStore.getState();

    const created = create({ parentId: "notebook-1", type: "folder", title: "Archive" });
    expect(getNode(useWorkspaceTreeStore.getState().nodes, created.id)?.title).toBe("Archive");

    rename(created.id, "Archived");
    expect(getNode(useWorkspaceTreeStore.getState().nodes, created.id)?.title).toBe("Archived");

    move(created.id, "folder-personal");
    expect(getNode(useWorkspaceTreeStore.getState().nodes, created.id)?.parentId).toBe("folder-personal");

    remove(created.id);
    expect(getNode(useWorkspaceTreeStore.getState().nodes, created.id)?.trashedAt).not.toBeNull();
  });

  it("restoreNode/purgeNode/emptyTrash mutate the store's nodes array", () => {
    const {
      createNode: create,
      deleteNode: remove,
      restoreNode: restore,
      purgeNode: purge,
      emptyTrash: empty,
    } = useWorkspaceTreeStore.getState();

    const a = create({ parentId: "notebook-1", type: "folder", title: "A" });
    remove(a.id);
    expect(getNode(useWorkspaceTreeStore.getState().nodes, a.id)?.trashedAt).not.toBeNull();

    restore(a.id);
    expect(getNode(useWorkspaceTreeStore.getState().nodes, a.id)?.trashedAt).toBeNull();

    remove(a.id);
    purge(a.id);
    expect(getNode(useWorkspaceTreeStore.getState().nodes, a.id)).toBeUndefined();

    const b = create({ parentId: "notebook-1", type: "folder", title: "B" });
    remove(b.id);
    empty();
    expect(getNode(useWorkspaceTreeStore.getState().nodes, b.id)).toBeUndefined();
  });

  it("sweepExpiredTrash purges trash roots older than retentionDays", () => {
    const { createNode: create, deleteNode: remove, sweepExpiredTrash: sweep } = useWorkspaceTreeStore.getState();

    const created = create({ parentId: "notebook-1", type: "folder", title: "Old" });
    remove(created.id);

    const farFuture = new Date(
      new Date(getNode(useWorkspaceTreeStore.getState().nodes, created.id)!.trashedAt as string).getTime() +
        31 * 24 * 60 * 60 * 1000,
    );
    sweep({ now: farFuture });
    expect(getNode(useWorkspaceTreeStore.getState().nodes, created.id)).toBeUndefined();
  });
});

describe("loadWorkspaceTree (NTA-69)", () => {
  beforeEach(() => {
    useWorkspaceTreeStore.setState({ nodes: [] });
  });

  it("loads the persisted tree into the store when one already exists", async () => {
    const persisted = [makeNode({ id: "a", parentId: null, type: "notebook" })];
    const persistence = makeFakePersistence({ readTree: vi.fn(async () => persisted) });

    await loadWorkspaceTree(persistence);

    expect(useWorkspaceTreeStore.getState().nodes).toEqual(persisted);
    expect(persistence.writeTree).not.toHaveBeenCalled(); // nothing to seed — a real tree was found
  });

  it("seeds and persists the default notebook when no tree.json exists yet (fresh workspace)", async () => {
    const persistence = makeFakePersistence({ readTree: vi.fn(async () => []) });

    await loadWorkspaceTree(persistence);

    expect(useWorkspaceTreeStore.getState().nodes.length).toBeGreaterThan(0);
    expect(persistence.writeTree).toHaveBeenCalledWith(useWorkspaceTreeStore.getState().nodes);
  });
});

describe("wireWorkspaceTreeAutosave (NTA-70)", () => {
  beforeEach(() => {
    useWorkspaceTreeStore.setState({ nodes: createSeedWorkspaceNodes() });
  });

  it("writes the tree immediately (not debounced) on every mutation", () => {
    const persistence = makeFakePersistence();
    const unsubscribe = wireWorkspaceTreeAutosave(persistence);
    try {
      useWorkspaceTreeStore.getState().createNode({ parentId: "notebook-1", type: "folder", title: "New" });

      expect(persistence.writeTree).toHaveBeenCalledTimes(1);
      expect(persistence.writeTree).toHaveBeenCalledWith(useWorkspaceTreeStore.getState().nodes);
    } finally {
      unsubscribe();
    }
  });

  it("does nothing when unrelated store state changes without the nodes reference actually changing", () => {
    const persistence = makeFakePersistence();
    const unsubscribe = wireWorkspaceTreeAutosave(persistence);
    try {
      // Same array reference — simulates a subscriber firing on a change
      // that isn't a tree mutation at all (defensive; this store doesn't
      // have any other top-level field today).
      useWorkspaceTreeStore.setState({ nodes: useWorkspaceTreeStore.getState().nodes });
      expect(persistence.writeTree).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("stops writing after unsubscribing", () => {
    const persistence = makeFakePersistence();
    const unsubscribe = wireWorkspaceTreeAutosave(persistence);
    unsubscribe();

    useWorkspaceTreeStore.getState().createNode({ parentId: "notebook-1", type: "folder", title: "New" });

    expect(persistence.writeTree).not.toHaveBeenCalled();
  });

  it("deletes a page's persisted content when it's permanently purged from trash", () => {
    const persistence = makeFakePersistence();
    const page = useWorkspaceTreeStore.getState().createNode({ parentId: "notebook-1", type: "page", title: "P" });
    const unsubscribe = wireWorkspaceTreeAutosave(persistence);
    try {
      useWorkspaceTreeStore.getState().deleteNode(page.id); // soft-delete first — purgeNode requires it
      expect(persistence.deletePage).not.toHaveBeenCalled(); // still restorable — content must survive

      useWorkspaceTreeStore.getState().purgeNode(page.id);

      expect(persistence.deletePage).toHaveBeenCalledWith(page.id);
    } finally {
      unsubscribe();
    }
  });

  it("does not delete a page's content on an ordinary soft-delete (restorable, still in the tree)", () => {
    const persistence = makeFakePersistence();
    const page = useWorkspaceTreeStore.getState().createNode({ parentId: "notebook-1", type: "page", title: "P" });
    const unsubscribe = wireWorkspaceTreeAutosave(persistence);
    try {
      useWorkspaceTreeStore.getState().deleteNode(page.id);
      expect(persistence.deletePage).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });
});
