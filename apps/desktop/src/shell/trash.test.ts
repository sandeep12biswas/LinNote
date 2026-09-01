import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "../types";
import { buildTrashList } from "./trash";

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

describe("buildTrashList", () => {
  it("returns an empty list when nothing is trashed", () => {
    const nodes = [makeNode({ id: "notebook", parentId: null, type: "notebook" })];
    expect(buildTrashList(nodes)).toEqual([]);
  });

  it("lists trash roots with their parent's title as context", () => {
    const nodes = [
      makeNode({ id: "notebook", parentId: null, type: "notebook", title: "My Notebook" }),
      makeNode({
        id: "folder",
        parentId: "notebook",
        type: "folder",
        title: "Old Folder",
        trashedAt: "2026-01-02T00:00:00.000Z",
      }),
    ];

    const rows = buildTrashList(nodes);
    expect(rows).toHaveLength(1);
    expect(rows[0].node.id).toBe("folder");
    expect(rows[0].parentTitle).toBe("My Notebook");
  });

  it("labels a trashed root-level notebook's parent as 'Notebooks'", () => {
    const nodes = [
      makeNode({
        id: "notebook",
        parentId: null,
        type: "notebook",
        title: "Old Notebook",
        trashedAt: "2026-01-02T00:00:00.000Z",
      }),
    ];

    expect(buildTrashList(nodes)[0].parentTitle).toBe("Notebooks");
  });

  it("excludes a cascade-trashed descendant whose parent is also trashed", () => {
    const nodes = [
      makeNode({ id: "notebook", parentId: null, type: "notebook", title: "My Notebook" }),
      makeNode({
        id: "folder",
        parentId: "notebook",
        type: "folder",
        title: "Folder",
        trashedAt: "2026-01-02T00:00:00.000Z",
      }),
      makeNode({
        id: "page",
        parentId: "folder",
        type: "page",
        title: "Page",
        trashedAt: "2026-01-02T00:00:00.000Z",
      }),
    ];

    const rows = buildTrashList(nodes);
    expect(rows.map((r) => r.node.id)).toEqual(["folder"]);
  });

  it("sorts most recently trashed first", () => {
    const nodes = [
      makeNode({ id: "notebook", parentId: null, type: "notebook", title: "My Notebook" }),
      makeNode({
        id: "older",
        parentId: "notebook",
        type: "folder",
        title: "Older",
        trashedAt: "2026-01-01T00:00:00.000Z",
      }),
      makeNode({
        id: "newer",
        parentId: "notebook",
        type: "folder",
        title: "Newer",
        trashedAt: "2026-01-05T00:00:00.000Z",
      }),
    ];

    expect(buildTrashList(nodes).map((r) => r.node.id)).toEqual(["newer", "older"]);
  });
});
