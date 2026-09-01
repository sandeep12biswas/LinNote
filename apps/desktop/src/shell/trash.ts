// Pure model-building half of NTA-54's Trash pane: given the full
// WorkspaceNode[] tree, builds the row list a Trash UI shows — mirrors
// buildFolderTree.ts/pageList.ts's split between pure model building
// (here, unit-tested) and rendering (./TrashPane.tsx).
//
// ../workspace's getTrashedNodes already narrows this to "trash roots"
// (a trashed node whose parent isn't itself trashed — see its own doc
// comment for why); this module just adds the parent-title breadcrumb
// the pane displays alongside each row.

import type { WorkspaceNode } from "../types";
import { getNode, getTrashedNodes } from "../workspace";

export interface TrashRow {
  node: WorkspaceNode;
  /** Title of the node's parent for display context — "Notebooks" for a trashed root-level notebook. */
  parentTitle: string;
}

export function buildTrashList(nodes: WorkspaceNode[]): TrashRow[] {
  return getTrashedNodes(nodes).map((node) => ({
    node,
    parentTitle: node.parentId ? (getNode(nodes, node.parentId)?.title ?? "Unknown") : "Notebooks",
  }));
}
