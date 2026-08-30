import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "../types";
import { buildFolderTree, canReparent } from "./folderTree";

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
