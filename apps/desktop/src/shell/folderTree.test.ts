import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "../types";
import { buildFolderTree, canDrop, canReparent, resolveDrop } from "./folderTree";

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

const nodes: WorkspaceNode[] = [
  makeNode({ id: "notebook", parentId: null, type: "notebook", order: "a0" }),
  makeNode({ id: "folderA", parentId: "notebook", type: "folder", order: "a0" }),
  makeNode({ id: "folderB", parentId: "notebook", type: "folder", order: "a1" }),
  makeNode({ id: "subfolder", parentId: "folderA", type: "folder", order: "a0" }),
  makeNode({ id: "page1", parentId: "folderA", type: "page", order: "a1" }),
];

describe("buildFolderTree", () => {
  it("shows only root nodes when nothing is expanded", () => {
    const rows = buildFolderTree(nodes, new Set());
    expect(rows.map((r) => r.node.id)).toEqual(["notebook"]);
    expect(rows[0].depth).toBe(0);
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[0].isExpanded).toBe(false);
  });

  it("filters out page nodes entirely, even nested under an expanded folder", () => {
    const rows = buildFolderTree(nodes, new Set(["notebook", "folderA"]));
    expect(rows.map((r) => r.node.id)).not.toContain("page1");
  });

  it("expands only the requested folder, at the correct depth", () => {
    const rows = buildFolderTree(nodes, new Set(["notebook"]));
    expect(rows.map((r) => r.node.id)).toEqual(["notebook", "folderA", "folderB"]);
    expect(rows.find((r) => r.node.id === "folderA")?.depth).toBe(1);
  });

  it("a collapsed folder's subtree is entirely absent, not just visually hidden", () => {
    // folderA is NOT expanded, so subfolder must not appear even though
    // its own parent (folderA) is visible.
    const rows = buildFolderTree(nodes, new Set(["notebook"]));
    expect(rows.map((r) => r.node.id)).not.toContain("subfolder");
  });

  it("expanding nested folders shows deeper rows in depth-first order", () => {
    const rows = buildFolderTree(nodes, new Set(["notebook", "folderA"]));
    expect(rows.map((r) => r.node.id)).toEqual(["notebook", "folderA", "subfolder", "folderB"]);
    expect(rows.find((r) => r.node.id === "subfolder")?.depth).toBe(2);
  });

  it("hasChildren is false for a leaf folder", () => {
    const rows = buildFolderTree(nodes, new Set(["notebook", "folderA"]));
    expect(rows.find((r) => r.node.id === "subfolder")?.hasChildren).toBe(false);
  });

  it("returns an empty list for an empty tree", () => {
    expect(buildFolderTree([], new Set())).toEqual([]);
  });
});

describe("canReparent", () => {
  it("is true for a valid, unrelated target", () => {
    expect(canReparent(nodes, "subfolder", "folderB")).toBe(true);
  });

  it("is false when dragging a node onto itself", () => {
    expect(canReparent(nodes, "folderA", "folderA")).toBe(false);
  });

  it("is false when dragging a node onto its own descendant", () => {
    expect(canReparent(nodes, "folderA", "subfolder")).toBe(false);
  });

  it("is false for a notebook — notebooks always stay root-level", () => {
    expect(canReparent(nodes, "notebook", "folderA")).toBe(false);
  });

  it("is false for an unknown dragged id", () => {
    expect(canReparent(nodes, "missing", "folderA")).toBe(false);
  });
});

describe("canDrop", () => {
  it("'into' is exactly canReparent", () => {
    expect(canDrop(nodes, "subfolder", "folderB", "into")).toBe(canReparent(nodes, "subfolder", "folderB"));
    expect(canDrop(nodes, "folderA", "subfolder", "into")).toBe(canReparent(nodes, "folderA", "subfolder"));
  });

  it("'before'/'after' are true for a valid, unrelated sibling target", () => {
    expect(canDrop(nodes, "folderB", "page1", "before")).toBe(true);
    expect(canDrop(nodes, "folderB", "page1", "after")).toBe(true);
  });

  it("'before'/'after' are false when the target is the dragged node itself", () => {
    expect(canDrop(nodes, "folderA", "folderA", "before")).toBe(false);
    expect(canDrop(nodes, "folderA", "folderA", "after")).toBe(false);
  });

  it("'before'/'after' are false when the target's parent is the dragged node itself", () => {
    // subfolder's parent is folderA — dropping folderA beside subfolder
    // would make folderA a sibling of its own child, i.e. its own parent.
    expect(canDrop(nodes, "folderA", "subfolder", "before")).toBe(false);
  });

  it("'before'/'after' are false for a notebook target's root level, unless the dragged node is itself a notebook", () => {
    // "notebook" has parentId null — reordering beside it would give a
    // non-notebook a null parentId, which §3 forbids.
    expect(canDrop(nodes, "folderA", "notebook", "before")).toBe(false);
    expect(canDrop(nodes, "folderA", "notebook", "after")).toBe(false);
  });

  it("'before'/'after' are false for an unknown target id", () => {
    expect(canDrop(nodes, "folderA", "missing", "before")).toBe(false);
    expect(canDrop(nodes, "folderA", "missing", "after")).toBe(false);
  });
});

describe("resolveDrop", () => {
  it("'into' reparents under the target itself, appending to the end", () => {
    expect(resolveDrop(nodes, "subfolder", "folderB", "into")).toEqual({ newParentId: "folderB" });
  });

  it("'before' inserts immediately ahead of the target, under the target's own parent", () => {
    // page1 sits after subfolder under folderA; dropping "folderB" before
    // page1 should reparent it under folderA, positioned right before page1.
    expect(resolveDrop(nodes, "folderB", "page1", "before")).toEqual({
      newParentId: "folderA",
      beforeSiblingId: "page1",
    });
  });

  it("'after' inserts immediately behind the target — before whichever sibling currently follows it", () => {
    // subfolder is immediately followed by page1 under folderA.
    expect(resolveDrop(nodes, "folderB", "subfolder", "after")).toEqual({
      newParentId: "folderA",
      beforeSiblingId: "page1",
    });
  });

  it("'after' the current last sibling omits beforeSiblingId (append to the end)", () => {
    expect(resolveDrop(nodes, "folderA", "page1", "after")).toEqual({ newParentId: "folderA" });
  });

  it("'after' excludes the dragged node itself from the next-sibling lookup", () => {
    // folderA's children are subfolder, then page1. Dropping "page1" after
    // "subfolder" (i.e. where page1 already sits) must not find page1 as
    // its own "next sibling" once it's excluded — it should see there's
    // nothing beyond it and append to the end instead.
    expect(resolveDrop(nodes, "page1", "subfolder", "after")).toEqual({ newParentId: "folderA" });
  });
});
