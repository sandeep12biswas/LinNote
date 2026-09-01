// The rendering half of NTA-51 — takes the `PageListRow[]` model built
// by `buildPageList` (./pageList.ts) and renders it: one row per page,
// indented by nesting depth, the row for `activePageId`
// (../store/index.ts) highlighted, click sets it as the active page.
//
// Command dispatch isn't relevant here the way it is for MenuBar.tsx/
// Toolbar.tsx — selecting a page is navigation state, not a plugin
// command — so this component talks to ../store directly, same as
// FolderTreePane.tsx.
//
// NTA-56: rows render through `react-window`'s `FixedSizeList` instead of
// a plain `rows.map(...)`, mirroring FolderTreePane.tsx's change — a
// folder with thousands of (sub)pages only ever mounts the rows actually
// scrolled into view. `<ul role="list">`/`<li role="listitem">` (the
// pre-NTA-56 markup) are preserved via `innerElementType` — `FixedSizeList`
// defaults both its outer (scroll container) and inner (item-sizer)
// wrapper to a plain `<div>`, so a semantic list needs a small forwarded
// component instead of a bare tag name for the inner one. See
// ./useElementSize.ts for how the list's required `height` is measured.

import { forwardRef } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { useNavigationStore } from "../store";
import { useWorkspaceTreeStore } from "../workspace";
import { buildPageList } from "./pageList";
import { useElementSize } from "./useElementSize";
import { PANE_ROW_HEIGHT } from "./virtualization";

const PageListUl = forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(function PageListUl(
  props,
  ref,
) {
  return <ul className="page-list" role="list" ref={ref} {...props} />;
});

export function PageListPane() {
  const nodes = useWorkspaceTreeStore((state) => state.nodes);
  const selectedFolderId = useNavigationStore((state) => state.selectedFolderId);
  const activePageId = useNavigationStore((state) => state.activePageId);
  const setActivePage = useNavigationStore((state) => state.setActivePage);

  // Hooks must run unconditionally — computed before the early returns below.
  const [viewportRef, viewportSize] = useElementSize<HTMLDivElement>();

  if (selectedFolderId == null) {
    return <p className="page-list__empty">Select a folder to see its pages.</p>;
  }

  const rows = buildPageList(nodes, selectedFolderId);

  if (rows.length === 0) {
    return <p className="page-list__empty">No pages here yet.</p>;
  }

  function renderRow({ index, style }: ListChildComponentProps) {
    const { node, depth } = rows[index];
    return (
      <li role="listitem" style={style}>
        <button
          type="button"
          className={["page-list__item", node.id === activePageId && "page-list__item--active"]
            .filter(Boolean)
            .join(" ")}
          style={{ paddingLeft: `${depth * 1.1 + 0.5}em` }}
          aria-current={node.id === activePageId ? "true" : undefined}
          onClick={() => setActivePage(node.id)}
        >
          {node.title}
        </button>
      </li>
    );
  }

  return (
    <div className="page-list__viewport" ref={viewportRef}>
      <FixedSizeList
        height={viewportSize.height}
        width={viewportSize.width}
        itemCount={rows.length}
        itemSize={PANE_ROW_HEIGHT}
        itemKey={(index) => rows[index].node.id}
        innerElementType={PageListUl}
      >
        {renderRow}
      </FixedSizeList>
    </div>
  );
}
