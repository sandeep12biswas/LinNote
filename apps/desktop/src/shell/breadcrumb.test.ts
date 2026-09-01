import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "../types";
import { buildBreadcrumb } from "./breadcrumb";

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
  makeNode({ id: "folder", parentId: "notebook", type: "folder", order: "a0" }),
  makeNode({ id: "page", parentId: "folder", type: "page", order: "a0" }),
  makeNode({ id: "subpage", parentId: "page", type: "page", order: "a0" }),
];

describe("buildBreadcrumb", () => {
  it("returns an empty trail when no page is open", () => {
    expect(buildBreadcrumb(nodes, null)).toEqual([]);
  });

  it("returns an empty trail when activePageId no longer exists in the tree (e.g. deleted)", () => {
    expect(buildBreadcrumb(nodes, "missing")).toEqual([]);
  });

  it("builds the full notebook > folder > page chain for a top-level page", () => {
    const segments = buildBreadcrumb(nodes, "page");
    expect(segments.map((s) => s.node.id)).toEqual(["notebook", "folder", "page"]);
  });

  it("includes intermediate page ancestors for a subpage", () => {
    const segments = buildBreadcrumb(nodes, "subpage");
    expect(segments.map((s) => s.node.id)).toEqual(["notebook", "folder", "page", "subpage"]);
  });

  it("flags only the last segment (the open page itself) as current", () => {
    const segments = buildBreadcrumb(nodes, "subpage");
    expect(segments.map((s) => s.isCurrent)).toEqual([false, false, false, true]);
  });
});
