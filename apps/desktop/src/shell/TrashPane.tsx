// The rendering half of NTA-54's Trash UI: browse currently-trashed
// notebooks/folders/pages, restore one (bringing its whole
// cascade-trashed subtree back — ../workspace's restoreNode), permanently
// delete one, or empty the trash outright. Toggled from AppShell.tsx and
// rendered as a `position: fixed` overlay above the 3-pane split, the
// same technique FolderTreePane.tsx's own context menu already uses —
// there's no Settings/modal UI shell yet (see PluginsStatusPanel.tsx's
// own note) to host this in instead.
//
// Also runs the §5.5 "background sweep" (../workspace's
// purgeExpiredTrash) on mount, permanently reclaiming anything already
// past the retention window — see purgeExpiredTrash's doc comment for
// why this stands in for a real periodic job for now.

import { useEffect } from "react";
import { useWorkspaceTreeStore } from "../workspace";
import { buildTrashList } from "./trash";

export interface TrashPaneProps {
  onClose: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  notebook: "Notebook",
  folder: "Folder",
  page: "Page",
};

export function TrashPane({ onClose }: TrashPaneProps) {
  const nodes = useWorkspaceTreeStore((state) => state.nodes);
  const restoreNode = useWorkspaceTreeStore((state) => state.restoreNode);
  const purgeNode = useWorkspaceTreeStore((state) => state.purgeNode);
  const emptyTrash = useWorkspaceTreeStore((state) => state.emptyTrash);
  const sweepExpiredTrash = useWorkspaceTreeStore((state) => state.sweepExpiredTrash);

  useEffect(() => {
    sweepExpiredTrash();
    // Runs once, on open — not on every `nodes` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = buildTrashList(nodes);

  function handlePurge(id: string, title: string) {
    if (window.confirm(`Permanently delete "${title}"? This can't be undone.`)) purgeNode(id);
  }

  function handleEmptyTrash() {
    if (window.confirm("Permanently delete everything in the trash? This can't be undone.")) emptyTrash();
  }

  return (
    <div className="trash-pane__overlay" onClick={onClose}>
      <section className="trash-pane" aria-label="Trash" onClick={(e) => e.stopPropagation()}>
        <header className="trash-pane__header">
          <h2 className="trash-pane__title">Trash</h2>
          <button type="button" className="trash-pane__close" aria-label="Close Trash" onClick={onClose}>
            ×
          </button>
        </header>

        {rows.length === 0 ? (
          <p className="trash-pane__empty">Trash is empty.</p>
        ) : (
          <>
            <ul className="trash-pane__list" role="list">
              {rows.map(({ node, parentTitle }) => (
                <li key={node.id} className="trash-pane__row">
                  <span className="trash-pane__type">{TYPE_LABEL[node.type]}</span>
                  <span className="trash-pane__label">{node.title}</span>
                  <span className="trash-pane__location">from {parentTitle}</span>
                  <span className="trash-pane__date">
                    {node.trashedAt ? new Date(node.trashedAt).toLocaleDateString() : ""}
                  </span>
                  <button type="button" onClick={() => restoreNode(node.id)}>
                    Restore
                  </button>
                  <button type="button" onClick={() => handlePurge(node.id, node.title)}>
                    Delete Permanently
                  </button>
                </li>
              ))}
            </ul>
            <footer className="trash-pane__footer">
              <button type="button" className="trash-pane__empty-trash" onClick={handleEmptyTrash}>
                Empty Trash
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
