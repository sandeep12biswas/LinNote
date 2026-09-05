import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "../types";
import { resolveSearchResultSelection } from "./searchNavigation";

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
  makeNode({ id: "notebook-1", parentId: null, type: "notebook" }),
  makeNode({ id: "folder-projects", parentId: "notebook-1", type: "folder" }),
  makeNode({ id: "page-roadmap", parentId: "folder-projects", type: "page" }),
  makeNode({ id: "page-roadmap-q1", parentId: "page-roadmap", type: "page" }),
];

describe("resolveSearchResultSelection", () => {
  it("selects a folder/notebook result directly, with no active page", () => {
    expect(resolveSearchResultSelection(nodes, { id: "folder-projects", type: "folder" })).toEqual({
      folderId: "folder-projects",
      pageId: null,
    });
    expect(resolveSearchResultSelection(nodes, { id: "notebook-1", type: "notebook" })).toEqual({
      folderId: "notebook-1",
      pageId: null,
    });
  });

  it("selects a top-level page's parent folder and sets it as the active page", () => {
    expect(resolveSearchResultSelection(nodes, { id: "page-roadmap", type: "page" })).toEqual({
      folderId: "folder-projects",
      pageId: "page-roadmap",
    });
  });

  it("walks past intermediate page ancestors to find the nearest folder for a nested subpage", () => {
    expect(resolveSearchResultSelection(nodes, { id: "page-roadmap-q1", type: "page" })).toEqual({
      folderId: "folder-projects",
      pageId: "page-roadmap-q1",
    });
  });

  it("returns folderId: null for an unknown id", () => {
    expect(resolveSearchResultSelection(nodes, { id: "does-not-exist", type: "page" })).toEqual({
      folderId: null,
      pageId: "does-not-exist",
    });
  });
});
