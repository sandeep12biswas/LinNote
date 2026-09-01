import { beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceNode } from "../types";
import { useWorkspaceTreeStore } from "../workspace";
import { createSeedWorkspaceNodes } from "../workspace/mockData";
import {
  buildSearchIndex,
  indexPageText,
  searchWorkspace,
  syncSearchIndex,
  useSearchIndexStore,
} from "./index";

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

describe("buildSearchIndex / searchWorkspace", () => {
  it("finds a node by (prefix of) its title", () => {
    const nodes = [
      makeNode({ id: "page-roadmap", parentId: "folder-1", type: "page", title: "Roadmap" }),
      makeNode({ id: "page-groceries", parentId: "folder-1", type: "page", title: "Groceries" }),
    ];
    const index = buildSearchIndex(nodes);

    expect(searchWorkspace(index, "road").map((r) => r.id)).toEqual(["page-roadmap"]);
    expect(searchWorkspace(index, "Roadmap")[0]).toMatchObject({ id: "page-roadmap", title: "Roadmap", type: "page" });
  });

  it("excludes trashed nodes", () => {
    const nodes = [
      makeNode({ id: "page-a", parentId: "folder-1", type: "page", title: "Trashed page", trashedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const index = buildSearchIndex(nodes);

    expect(searchWorkspace(index, "trashed")).toEqual([]);
  });

  it("returns no results for an empty/whitespace query", () => {
    const index = buildSearchIndex([makeNode({ id: "page-a", parentId: null, type: "notebook", title: "Anything" })]);

    expect(searchWorkspace(index, "")).toEqual([]);
    expect(searchWorkspace(index, "   ")).toEqual([]);
  });

  it("ranks a title match above a body-text-only match for the same term", () => {
    const nodes = [
      makeNode({ id: "page-a", parentId: "folder-1", type: "page", title: "Budget" }),
      makeNode({ id: "page-b", parentId: "folder-1", type: "page", title: "Unrelated" }),
    ];
    const index = buildSearchIndex(nodes);
    indexPageText(index, "page-b", "this page mentions budget in passing");

    const results = searchWorkspace(index, "budget");
    expect(results.map((r) => r.id)).toEqual(["page-a", "page-b"]);
  });
});

describe("syncSearchIndex", () => {
  it("adds a newly created node", () => {
    const before: WorkspaceNode[] = [];
    const after = [makeNode({ id: "page-a", parentId: null, type: "notebook", title: "New Notebook" })];
    const index = buildSearchIndex(before);

    syncSearchIndex(index, before, after);

    expect(searchWorkspace(index, "New Notebook").map((r) => r.id)).toEqual(["page-a"]);
  });

  it("updates a renamed node in place, without losing already-indexed text", () => {
    const before = [makeNode({ id: "page-a", parentId: null, type: "page", title: "Old Title" })];
    const index = buildSearchIndex(before);
    indexPageText(index, "page-a", "some body content mentioning kangaroo");

    const after = [makeNode({ id: "page-a", parentId: null, type: "page", title: "New Title" })];
    syncSearchIndex(index, before, after);

    expect(searchWorkspace(index, "New Title").map((r) => r.id)).toEqual(["page-a"]);
    // "Old" itself no longer matches anything — only "Title" (shared with
    // the new title) would, which is correct OR-of-terms behavior, not
    // what this assertion is checking.
    expect(searchWorkspace(index, "Old")).toEqual([]);
    expect(searchWorkspace(index, "kangaroo").map((r) => r.id)).toEqual(["page-a"]);
  });

  it("leaves an unchanged node untouched (no title change, still not trashed)", () => {
    const before = [makeNode({ id: "page-a", parentId: null, type: "page", title: "Stable" })];
    const index = buildSearchIndex(before);

    // Same title, only e.g. `updatedAt` differs — should not require a replace.
    const after = [{ ...before[0], updatedAt: "2026-02-01T00:00:00.000Z" }];
    syncSearchIndex(index, before, after);

    expect(searchWorkspace(index, "Stable").map((r) => r.id)).toEqual(["page-a"]);
  });

  it("discards a node the moment it's trashed", () => {
    const before = [makeNode({ id: "page-a", parentId: null, type: "page", title: "Groceries" })];
    const index = buildSearchIndex(before);

    const after = [{ ...before[0], trashedAt: "2026-01-05T00:00:00.000Z" }];
    syncSearchIndex(index, before, after);

    expect(searchWorkspace(index, "Groceries")).toEqual([]);
  });

  it("re-adds a node restored from trash", () => {
    const trashed = makeNode({
      id: "page-a",
      parentId: null,
      type: "page",
      title: "Restored",
      trashedAt: "2026-01-05T00:00:00.000Z",
    });
    const index = buildSearchIndex([trashed]);
    expect(searchWorkspace(index, "Restored")).toEqual([]);

    const restored = { ...trashed, trashedAt: null };
    syncSearchIndex(index, [trashed], [restored]);

    expect(searchWorkspace(index, "Restored").map((r) => r.id)).toEqual(["page-a"]);
  });
});

describe("indexPageText", () => {
  it("is a no-op for an unknown id", () => {
    const index = buildSearchIndex([]);
    expect(() => indexPageText(index, "does-not-exist", "some text")).not.toThrow();
    expect(searchWorkspace(index, "some text")).toEqual([]);
  });

  it("makes a page's extracted text searchable without changing its title", () => {
    const nodes = [makeNode({ id: "page-a", parentId: null, type: "page", title: "Meeting Notes" })];
    const index = buildSearchIndex(nodes);

    indexPageText(index, "page-a", "discussed the quarterly roadmap");

    expect(searchWorkspace(index, "quarterly").map((r) => r.id)).toEqual(["page-a"]);
    expect(searchWorkspace(index, "Meeting Notes").map((r) => r.id)).toEqual(["page-a"]);
  });
});

describe("useSearchIndexStore", () => {
  beforeEach(() => {
    useWorkspaceTreeStore.setState({ nodes: createSeedWorkspaceNodes() });
    useSearchIndexStore.setState({ index: buildSearchIndex(createSeedWorkspaceNodes()), version: 0 });
  });

  it("starts seeded from the workspace tree store's current nodes", () => {
    expect(useSearchIndexStore.getState().search("Roadmap").map((r) => r.id)).toEqual(["page-roadmap"]);
  });

  it("stays in sync as the workspace tree store is mutated", () => {
    expect(useSearchIndexStore.getState().search("Archive")).toEqual([]);

    const created = useWorkspaceTreeStore.getState().createNode({
      parentId: "notebook-1",
      type: "folder",
      title: "Archive",
    });

    expect(useSearchIndexStore.getState().search("Archive").map((r) => r.id)).toEqual([created.id]);

    useWorkspaceTreeStore.getState().deleteNode(created.id);
    expect(useSearchIndexStore.getState().search("Archive")).toEqual([]);
  });

  it("indexPageText updates the store's index and bumps version", () => {
    const versionBefore = useSearchIndexStore.getState().version;

    useSearchIndexStore.getState().indexPageText("page-roadmap", "discussed the upcoming asparagus harvest");

    expect(useSearchIndexStore.getState().version).toBeGreaterThan(versionBefore);
    expect(useSearchIndexStore.getState().search("asparagus").map((r) => r.id)).toEqual(["page-roadmap"]);
  });
});
