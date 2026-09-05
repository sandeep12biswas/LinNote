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
//
// NTA-53 adds `canDrop`/`resolveDrop` below: same-parent drag-to-reorder,
// alongside `canReparent`'s existing drop-into-a-folder case.

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

// ---- NTA-53: same-parent drag-to-reorder ------------------------------

/**
 * Where a drop lands relative to the hovered row: "into" reparents
 * `draggedId` under that row (NTA-50's existing drop-onto-a-folder
 * case); "before"/"after" reorder `draggedId` to sit beside that row as
 * a sibling, under the row's own parent — precise same-parent
 * drag-to-reorder (NTA-53). `FolderTreePane` picks one of the three from
 * where within a row's height the pointer currently sits.
 */
export type DropPosition = "before" | "after" | "into";

/**
 * Whether dropping `draggedId` at `position` relative to `targetId` is
 * legal. "into" is exactly `canReparent`. "before"/"after" judge
 * legality against `targetId`'s own parent, since that's who
 * `draggedId` would become a sibling of — same rules either way: not
 * onto itself, not into its own descendant, never a notebook (root
 * level holds only notebooks, and notebooks aren't draggable in the
 * pane to begin with, so a non-notebook can never legally sit beside
 * one there).
 */
export function canDrop(
  nodes: WorkspaceNode[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): boolean {
  if (position === "into") return canReparent(nodes, draggedId, targetId);

  const target = nodes.find((n) => n.id === targetId);
  if (!target || target.id === draggedId) return false;
  if (target.parentId == null) {
    const dragged = nodes.find((n) => n.id === draggedId);
    return dragged?.type === "notebook";
  }
  return canReparent(nodes, draggedId, target.parentId);
}

/** The `moveNode` call (../workspace) that realizes one `canDrop`-legal drop. */
export interface ResolvedDrop {
  newParentId: string | null;
  beforeSiblingId?: string;
}

/**
 * Turns a `canDrop`-legal `(targetId, position)` into the `moveNode`
 * arguments that realize it. "into" reparents under `targetId` itself,
 * appending to the end (NTA-50's existing behavior — precise positioning
 * *within* a folder being dropped into isn't this ticket's scope, only
 * same-parent reordering is). "before" inserts immediately ahead of
 * `targetId`; "after" inserts immediately behind it — found by looking
 * up `targetId`'s current next sibling and reusing `moveNode`'s own
 * "insert before this id, or append if omitted/not found" semantics.
 */
export function resolveDrop(
  nodes: WorkspaceNode[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): ResolvedDrop {
  const target = nodes.find((n) => n.id === targetId) as WorkspaceNode;
  if (position === "into") return { newParentId: target.id };
  if (position === "before") return { newParentId: target.parentId, beforeSiblingId: target.id };

  const siblings = getChildren(nodes, target.parentId).filter((n) => n.id !== draggedId);
  const targetIndex = siblings.findIndex((n) => n.id === target.id);
  const nextSibling = siblings[targetIndex + 1];
  return { newParentId: target.parentId, beforeSiblingId: nextSibling?.id };
}
