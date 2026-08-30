// The rendering half of NTA-51 — takes the `PageListRow[]` model built
// by `buildPageList` (./pageList.ts) and renders it: one row per page,
// indented by nesting depth, the row for `activePageId`
// (../store/index.ts) highlighted, click sets it as the active page.
//
// Command dispatch isn't relevant here the way it is for MenuBar.tsx/
// Toolbar.tsx — selecting a page is navigation state, not a plugin
// command — so this component talks to ../store directly, same as
// FolderTreePane.tsx.

import { useNavigationStore } from "../store";
import { useWorkspaceTreeStore } from "../workspace";
import { buildPageList } from "./pageList";

export function PageListPane() {
  const nodes = useWorkspaceTreeStore((state) => state.nodes);
  const selectedFolderId = useNavigationStore((state) => state.selectedFolderId);
  const activePageId = useNavigationStore((state) => state.activePageId);
  const setActivePage = useNavigationStore((state) => state.setActivePage);

  if (selectedFolderId == null) {
    return <p className="page-list__empty">Select a folder to see its pages.</p>;
  }

  const rows = buildPageList(nodes, selectedFolderId);

  if (rows.length === 0) {
    return <p className="page-list__empty">No pages here yet.</p>;
  }

  return (
    <ul className="page-list" role="list">
      {rows.map(({ node, depth }) => (
        <li key={node.id} role="listitem">
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
      ))}
    </ul>
  );
}
