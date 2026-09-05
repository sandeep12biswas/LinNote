// NTA-56 — pure half of SearchBox.tsx's "click a result, land on it"
// behavior: resolving a `../search` result (any `WorkspaceNode`
// type — notebook, folder, or page) into the `selectedFolderId`/
// `activePageId` pair ../store expects. Split out like
// ./folderTree.ts/./pageList.ts, so this is testable without React.

import type { NodeType, WorkspaceNode } from "../types";
import { getNode } from "../workspace";

export interface SearchResultSelection {
  /** Nearest notebook/folder ancestor — always what the Folder Tree pane (§5.4) expects `selectedFolderId` to be. */
  folderId: string | null;
  /** Set only when the result itself is a page. */
  pageId: string | null;
}

/**
 * A notebook/folder result selects itself directly. A page result isn't a
 * valid `selectedFolderId` (only `notebook`/`folder` nodes render in the
 * Folder Tree pane, per ./folderTree.ts's `buildFolderTree`) — including
 * a nested subpage (a page whose own parent is another page, per
 * ./pageList.ts) — so this walks up `parentId` until it finds one.
 */
export function resolveSearchResultSelection(
  nodes: WorkspaceNode[],
  result: { id: string; type: NodeType },
): SearchResultSelection {
  if (result.type !== "page") {
    return { folderId: result.id, pageId: null };
  }

  let ancestor = getNode(nodes, result.id);
  while (ancestor && ancestor.type === "page") {
    ancestor = ancestor.parentId ? getNode(nodes, ancestor.parentId) : undefined;
  }

  return { folderId: ancestor?.id ?? null, pageId: result.id };
}
