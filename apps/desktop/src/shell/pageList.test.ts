import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "../types";
import { buildPageList } from "./pageList";

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
  makeNode({ id: "pageA1", parentId: "folderA", type: "page", order: "a0" }),
  makeNode({ id: "pageA1-sub", parentId: "pageA1", type: "page", order: "a0" }),
  makeNode({ id: "pageA2", parentId: "folderA", type: "page", order: "a1" }),
  makeNode({ id: "pageB1", parentId: "folderB", type: "page", order: "a0" }),
];

describe("buildPageList", () => {
  it("returns an empty list when no folder is selected", () => {
    expect(buildPageList(nodes, null)).toEqual([]);
  });

  it("lists direct page children of the selected folder", () => {
    const rows = buildPageList(nodes, "folderA");
    expect(rows.map((r) => r.node.id)).toEqual(["pageA1", "pageA1-sub", "pageA2"]);
  });

  it("nests a subpage beneath its parent page at depth + 1", () => {
    const rows = buildPageList(nodes, "folderA");
    const parent = rows.find((r) => r.node.id === "pageA1");
    const sub = rows.find((r) => r.node.id === "pageA1-sub");
    expect(parent?.depth).toBe(0);
    expect(sub?.depth).toBe(1);
  });

  it("excludes pages that belong to a different folder", () => {
    const rows = buildPageList(nodes, "folderA");
    expect(rows.map((r) => r.node.id)).not.toContain("pageB1");
  });

  it("excludes folder/notebook nodes themselves", () => {
    const rows = buildPageList(nodes, "folderA");
    expect(rows.map((r) => r.node.id)).not.toContain("folderA");
    expect(rows.map((r) => r.node.id)).not.toContain("notebook");
  });

  it("returns an empty list for a folder with no pages", () => {
    expect(buildPageList(nodes, "notebook")).toEqual([]);
  });
});
