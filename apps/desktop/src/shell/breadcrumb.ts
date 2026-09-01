// Pure model-building half of NTA-55 (breadcrumb trail above the editor
// canvas): given the full WorkspaceNode[] tree and whichever page is
// currently open (../store's `activePageId`), builds the ordered
// "notebook > folder > ... > page" trail — §5.4: "Shows the open page's
// ancestor chain back to its notebook, above the editor canvas." Mirrors
// buildFolderTree/buildPageList's split (./folderTree.ts, ./pageList.ts)
// between pure model building (here, tested) and rendering
// (./BreadcrumbTrail.tsx).
//
// Delegates the actual tree walk to `getAncestorChain` (../workspace/) —
// the same general-purpose tree query `getDescendantIds`/`isSelfOrDescendant`
// already live alongside — and just flags which segment is the page
// itself for the component to render as "current".

import type { WorkspaceNode } from "../types";
import { getAncestorChain } from "../workspace";

export interface BreadcrumbSegment {
  node: WorkspaceNode;
  /** True for the last segment — the currently-open page itself. */
  isCurrent: boolean;
}

/**
 * No open page (`activePageId` is `null`, or points at a node no longer
 * in the tree, e.g. after a delete) means no breadcrumb — an empty array,
 * which `BreadcrumbTrail` renders as nothing.
 */
export function buildBreadcrumb(nodes: WorkspaceNode[], activePageId: string | null): BreadcrumbSegment[] {
  if (activePageId == null) return [];

  const chain = getAncestorChain(nodes, activePageId);
  if (chain.length === 0) return [];

  return chain.map((node, index) => ({ node, isCurrent: index === chain.length - 1 }));
}
