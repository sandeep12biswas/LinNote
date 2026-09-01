// The rendering half of NTA-50 — takes the `FolderTreeRow[]` model built
// by `buildFolderTree` (./folderTree.ts) and renders it: expand/collapse
// disclosure triangles, click-to-select (writes `selectedFolderId` in
// ../store), native HTML5 drag-to-reparent with a highlighted
// insertion-indicator row, and a right-click context menu (rename, move,
// delete, new folder) driven by ../workspace's `useWorkspaceTreeStore`.
//
// Mirrors MenuBar.tsx/Toolbar.tsx's decoupling: this component reads and
// writes the workspace tree store directly (there's no command-bus
// indirection for structural operations the way there is for
// `onRunCommand`), since create/rename/move/delete aren't plugin
// commands — they're this pane's own job per §5.4.
//
// TODO(NTA-52): move/rename/delete/create below aren't undoable yet —
// that's a separate subtask of the same parent story (NTA-43).
// TODO(NTA-53): dropping a node only appends it to the end of the target
// folder's children (or, via the "Move" menu, likewise) — same-parent
// drag-to-reorder with precise sibling positioning is that subtask.

import { useState } from "react";
import type { WorkspaceNode } from "../types";
import { useNavigationStore } from "../store";
import { getDescendantIds, useWorkspaceTreeStore } from "../workspace";
import { buildFolderTree, canReparent } from "./folderTree";

type ContextMenuMode = "menu" | "move";

interface ContextMenuState {
  nodeId: string;
  x: number;
  y: number;
  mode: ContextMenuMode;
}

export function FolderTreePane() {
  const nodes = useWorkspaceTreeStore((state) => state.nodes);
  const createNode = useWorkspaceTreeStore((state) => state.createNode);
  const renameNode = useWorkspaceTreeStore((state) => state.renameNode);
  const moveNode = useWorkspaceTreeStore((state) => state.moveNode);
  const deleteNode = useWorkspaceTreeStore((state) => state.deleteNode);

  const selectedFolderId = useNavigationStore((state) => state.selectedFolderId);
  const setSelectedFolder = useNavigationStore((state) => state.setSelectedFolder);
  const activePageId = useNavigationStore((state) => state.activePageId);
  const setActivePage = useNavigationStore((state) => state.setActivePage);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const rows = buildFolderTree(nodes, expandedIds);

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startRename(node: WorkspaceNode) {
    setContextMenu(null);
    setRenamingId(node.id);
    setRenameValue(node.title);
  }

  function commitRename() {
    if (renamingId) {
      const trimmed = renameValue.trim();
      if (trimmed) renameNode(renamingId, trimmed);
    }
    setRenamingId(null);
  }

  function handleNewFolder(parentId: string) {
    const created = createNode({ parentId, type: "folder", title: "New Folder" });
    setExpandedIds((current) => new Set(current).add(parentId));
    startRename(created);
  }

  function handleDelete(nodeId: string) {
    const deletedIds = new Set([nodeId, ...getDescendantIds(nodes, nodeId)]);
    if (selectedFolderId && deletedIds.has(selectedFolderId)) setSelectedFolder(null);
    if (activePageId && deletedIds.has(activePageId)) setActivePage(null);
    deleteNode(nodeId);
    setContextMenu(null);
  }

  function reparent(id: string, targetParentId: string) {
    if (!canReparent(nodes, id, targetParentId)) return;
    moveNode(id, targetParentId);
    setExpandedIds((current) => new Set(current).add(targetParentId));
  }

  function handleDrop(targetId: string) {
    if (draggedId) reparent(draggedId, targetId);
    setDraggedId(null);
    setDropTargetId(null);
  }

  const moveTargets =
    contextMenu?.mode === "move"
      ? nodes.filter((n) => n.type !== "page" && n.trashedAt == null && canReparent(nodes, contextMenu.nodeId, n.id))
      : [];

  return (
    <div className="folder-tree" onClick={() => setContextMenu(null)}>
      {rows.length === 0 && <p className="folder-tree__empty">No notebooks yet.</p>}

      {rows.map((row) => {
        const isDraggable = row.node.type !== "notebook";
        const rowClassName = [
          "folder-tree__row",
          row.node.id === selectedFolderId && "folder-tree__row--selected",
          row.node.id === dropTargetId && "folder-tree__row--drop-target",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={row.node.id}
            className={rowClassName}
            style={{ paddingLeft: `${row.depth * 1.1}em` }}
            draggable={isDraggable}
            onDragStart={() => isDraggable && setDraggedId(row.node.id)}
            onDragEnd={() => {
              setDraggedId(null);
              setDropTargetId(null);
            }}
            onDragOver={(e) => {
              if (draggedId && canReparent(nodes, draggedId, row.node.id)) {
                e.preventDefault();
                setDropTargetId(row.node.id);
              }
            }}
            onDragLeave={() => setDropTargetId((current) => (current === row.node.id ? null : current))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(row.node.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFolder(row.node.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ nodeId: row.node.id, x: e.clientX, y: e.clientY, mode: "menu" });
            }}
          >
            <button
              type="button"
              className="folder-tree__disclosure"
              aria-label={row.isExpanded ? "Collapse" : "Expand"}
              disabled={!row.hasChildren}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(row.node.id);
              }}
            >
              {row.hasChildren ? (row.isExpanded ? "▾" : "▸") : ""}
            </button>

            {row.node.id === renamingId ? (
              <input
                autoFocus
                className="folder-tree__rename-input"
                value={renameValue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenamingId(null);
                }}
              />
            ) : (
              <span className="folder-tree__label">{row.node.title}</span>
            )}
          </div>
        );
      })}

      {contextMenu && contextMenu.mode === "menu" && (
        <ul className="folder-tree__context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const node = nodes.find((n) => n.id === contextMenu.nodeId);
                if (node) startRename(node);
              }}
            >
              Rename
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={() => setContextMenu({ ...contextMenu, mode: "move" })}>
              Move
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={() => handleDelete(contextMenu.nodeId)}>
              Delete
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={() => handleNewFolder(contextMenu.nodeId)}>
              New Folder
            </button>
          </li>
        </ul>
      )}

      {contextMenu && contextMenu.mode === "move" && (
        <ul className="folder-tree__context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} role="menu">
          {moveTargets.length === 0 && <li className="folder-tree__context-menu-empty">No valid destination</li>}
          {moveTargets.map((target) => (
            <li role="none" key={target.id}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  reparent(contextMenu.nodeId, target.id);
                  setContextMenu(null);
                }}
              >
                {target.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
