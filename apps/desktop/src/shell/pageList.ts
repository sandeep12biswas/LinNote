// Pure model-building half of NTA-51 (Page List pane): given the full
// WorkspaceNode[] tree and whichever folder is currently selected in the
// Folder Tree pane, builds the ordered, depth-annotated list of that
// folder's `page`-type children plus every nested subpage (a page whose
// parentId is another page, not the folder itself) — §5.4: "the Page
// List pane lists page children of whichever folder is selected...,
// with subpages shown nested/indented". Mirrors buildFolderTree's split
// (./folderTree.ts) between pure model building (here, tested) and
// rendering (./PageListPane.tsx).

import type { WorkspaceNode } from "../types";
import { getChildren } from "../workspace";

export interface PageListRow {
  node: WorkspaceNode;
  depth: number;
}

export function buildPageList(nodes: WorkspaceNode[], selectedFolderId: string | null): PageListRow[] {
  if (selectedFolderId == null) return [];

  const pageNodes = nodes.filter((n) => n.type === "page");
  const rows: PageListRow[] = [];

  function visit(parentId: string, depth: number) {
    for (const node of getChildren(pageNodes, parentId)) {
      rows.push({ node, depth });
      visit(node.id, depth + 1);
    }
  }

  visit(selectedFolderId, 0);
  return rows;
}
