// Pure model-building half of NTA-50 (Folder Tree pane): flattens the
// notebook/folder subset of a WorkspaceNode[] tree into an ordered,
// depth-annotated row list, respecting which folders are currently
// expanded — mirrors buildMenuBar/buildToolbar's split (./index.ts)
// between a pure, easily-tested model builder and the React component
// (./FolderTreePane.tsx) that renders it.
//
// §5.4: "The Folder Tree pane renders only notebook/folder nodes" —
// `page` nodes are filtered out entirely here, not just visually hidden,
// so a page never shows up mid-tree even nested under an expanded
// folder.

import type { WorkspaceNode } from "../types";
import { getChildren, isSelfOrDescendant } from "../workspace";

export interface FolderTreeRow {
  node: WorkspaceNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

/**
 * Depth-first flatten starting from the root (`parentId === null`)
 * notebooks. A folder's children are only included in the result when
 * its id is in `expandedIds` — a collapsed folder's subtree doesn't
 * appear at all, it isn't merely styled hidden.
 */
export function buildFolderTree(nodes: WorkspaceNode[], expandedIds: ReadonlySet<string>): FolderTreeRow[] {
  const folderNodes = nodes.filter((n) => n.type !== "page");
  const rows: FolderTreeRow[] = [];

  function visit(parentId: string | null, depth: number) {
    for (const node of getChildren(folderNodes, parentId)) {
      const isExpanded = expandedIds.has(node.id);
      const hasChildren = getChildren(folderNodes, node.id).length > 0;
      rows.push({ node, depth, hasChildren, isExpanded });
      if (isExpanded) visit(node.id, depth + 1);
    }
  }

  visit(null, 0);
  return rows;
}

/**
 * Whether dragging `draggedId` onto `targetParentId` is a legal
 * reparent: not the node itself, not one of its own descendants (would
 * disconnect that subtree), and not a `notebook` (§3: notebooks are
 * always root-level, `parentId: null`).
 */
export function canReparent(nodes: WorkspaceNode[], draggedId: string, targetParentId: string): boolean {
  const dragged = nodes.find((n) => n.id === draggedId);
  if (!dragged || dragged.type === "notebook") return false;
  return draggedId !== targetParentId && !isSelfOrDescendant(nodes, draggedId, targetParentId);
}
