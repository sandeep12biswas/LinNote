// The rendering half of NTA-55 — takes the `BreadcrumbSegment[]` model
// built by `buildBreadcrumb` (./breadcrumb.ts) and renders it as a
// "notebook > folder > ... > page" trail above the Editor Canvas pane
// (../shell/AppShell.tsx). Renders nothing when no page is open.
//
// Mirrors FolderTreePane.tsx/PageListPane.tsx: reads/writes ../store and
// ../workspace directly rather than through the command bus, since
// breadcrumb navigation is navigation state, not a plugin command.
//
// Every segment is clickable, including the current (last) one — a
// folder/notebook segment selects that folder (../store's
// `selectedFolderId`, same as clicking it in the Folder Tree pane); a
// page segment (an intermediate subpage ancestor, or the current page
// itself) opens that page (../store's `activePageId`, same as clicking
// it in the Page List pane).

import { useNavigationStore } from "../store";
import { useWorkspaceTreeStore } from "../workspace";
import { buildBreadcrumb } from "./breadcrumb";
import type { WorkspaceNode } from "../types";

export function BreadcrumbTrail() {
  const nodes = useWorkspaceTreeStore((state) => state.nodes);
  const activePageId = useNavigationStore((state) => state.activePageId);
  const setSelectedFolder = useNavigationStore((state) => state.setSelectedFolder);
  const setActivePage = useNavigationStore((state) => state.setActivePage);

  const segments = buildBreadcrumb(nodes, activePageId);
  if (segments.length === 0) return null;

  function navigateTo(node: WorkspaceNode) {
    if (node.type === "page") setActivePage(node.id);
    else setSelectedFolder(node.id);
  }

  return (
    <nav className="breadcrumb-trail" aria-label="Breadcrumb">
      <ol className="breadcrumb-trail__list">
        {segments.map(({ node, isCurrent }, index) => (
          <li key={node.id} className="breadcrumb-trail__item">
            {index > 0 && (
              <span className="breadcrumb-trail__separator" aria-hidden="true">
                {"›"}
              </span>
            )}
            <button
              type="button"
              className={["breadcrumb-trail__segment", isCurrent && "breadcrumb-trail__segment--current"]
                .filter(Boolean)
                .join(" ")}
              aria-current={isCurrent ? "page" : undefined}
              onClick={() => navigateTo(node)}
            >
              {node.title}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
