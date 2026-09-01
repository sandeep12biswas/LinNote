// The rendering half of NTA-50 — takes the `FolderTreeRow[]` model built
// by `buildFolderTree` (./folderTree.ts) and renders it: expand/collapse
// disclosure triangles, click-to-select (writes `selectedFolderId` in
// ../store), native HTML5 drag-and-drop (reparent, or same-parent
// reorder — NTA-53) with a highlighted insertion indicator, and a
// right-click context menu (rename, move, delete, new folder) driven by
// ../workspace's `useWorkspaceTreeStore`.
//
// Mirrors MenuBar.tsx/Toolbar.tsx's decoupling: this component reads and
// writes the workspace tree store directly (there's no command-bus
// indirection for structural operations the way there is for
// `onRunCommand`), since create/rename/move/delete aren't plugin
// commands — they're this pane's own job per §5.4. NTA-52 adds one more
// layer of indirection *within* that: every mutation goes through
// ./structuralUndoStack.ts's `useStructuralUndoStore.execute` instead of
// calling `useWorkspaceTreeStore`'s create/rename/move/delete directly,
// via the `Command` factories in ./workspaceCommands.ts — Ctrl+Z/
// Ctrl+Shift+Z below (guarded off the rename `<input>`, whose native
// text-undo should win instead) and the Undo/Redo buttons drive that
// stack.
//
// NTA-53: dropping a node onto the middle of a row still reparents it
// (appended to the end of that row's children, as before); dropping onto
// a row's top/bottom edge now reorders it to sit immediately
// before/after that row among its *current* siblings instead — see
// `dropZone`/`canDrop`/`resolveDrop` below and in ./folderTree.ts.
//
// NTA-56: rows are rendered through `react-window`'s `FixedSizeList`
// instead of a plain `rows.map(...)`, so a workspace with thousands of
// expanded nodes only ever mounts the handful of rows actually visible in
// the pane, not every row up front. `buildFolderTree` (./folderTree.ts)
// itself was already "lazy" in the sense that matters here — it only
// walks into a folder's children once that folder is in `expandedIds`, a
// collapsed subtree isn't visited at all — this ticket's addition is
// virtualizing the *rendering* of whatever `buildFolderTree` does return.
// `useElementSize` (./useElementSize.ts) measures the pane's actual
// available height (no `AutoSizer` package is a dependency here, see that
// file's doc comment) since `FixedSizeList` needs an explicit `height`.

import { useEffect, useState } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import type { WorkspaceNode } from "../types";
import { useNavigationStore } from "../store";
import { getDescendantIds, useWorkspaceTreeStore } from "../workspace";
import { buildFolderTree, canDrop, canReparent, resolveDrop, type DropPosition } from "./folderTree";
import { useStructuralUndoStore } from "./structuralUndoStack";
import {
  createCreateNodeCommand,
  createDeleteNodeCommand,
  createMoveNodeCommand,
  createRenameNodeCommand,
} from "./workspaceCommands";
import { useElementSize } from "./useElementSize";
import { PANE_ROW_HEIGHT } from "./virtualization";

/**
 * Splits a row's height into three drop zones: the outer quarters mean
 * "reorder beside this row" (before/after), the middle half means
 * "reparent into this row" — keeps the common reparent-by-dropping
 * gesture easy to hit while still leaving room for precise reordering at
 * a row's edges. `offsetRatio` is `0` at the row's top edge, `1` at its
 * bottom edge.
 */
function dropZone(offsetRatio: number): DropPosition {
  if (offsetRatio < 0.25) return "before";
  if (offsetRatio > 0.75) return "after";
  return "into";
}

type ContextMenuMode = "menu" | "move";

interface ContextMenuState {
  nodeId: string;
  x: number;
  y: number;
  mode: ContextMenuMode;
}

export function FolderTreePane() {
  const nodes = useWorkspaceTreeStore((state) => state.nodes);

  const executeCommand = useStructuralUndoStore((state) => state.execute);
  const undo = useStructuralUndoStore((state) => state.undo);
  const redo = useStructuralUndoStore((state) => state.redo);
  const canUndo = useStructuralUndoStore((state) => state.undoStack.length > 0);
  const canRedo = useStructuralUndoStore((state) => state.redoStack.length > 0);

  const selectedFolderId = useNavigationStore((state) => state.selectedFolderId);
  const setSelectedFolder = useNavigationStore((state) => state.setSelectedFolder);
  const activePageId = useNavigationStore((state) => state.activePageId);
  const setActivePage = useNavigationStore((state) => state.setActivePage);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ targetId: string; position: DropPosition } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [viewportRef, viewportSize] = useElementSize<HTMLDivElement>();

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
      if (trimmed) executeCommand(createRenameNodeCommand(renamingId, trimmed));
    }
    setRenamingId(null);
  }

  function handleNewFolder(parentId: string) {
    const { command, node: created } = createCreateNodeCommand({ parentId, type: "folder", title: "New Folder" });
    executeCommand(command);
    setExpandedIds((current) => new Set(current).add(parentId));
    startRename(created);
  }

  function handleDelete(nodeId: string) {
    const deletedIds = new Set([nodeId, ...getDescendantIds(nodes, nodeId)]);
    if (selectedFolderId && deletedIds.has(selectedFolderId)) setSelectedFolder(null);
    if (activePageId && deletedIds.has(activePageId)) setActivePage(null);
    executeCommand(createDeleteNodeCommand(nodeId));
    setContextMenu(null);
  }

  function reparent(id: string, targetParentId: string) {
    if (!canReparent(nodes, id, targetParentId)) return;
    executeCommand(createMoveNodeCommand(id, targetParentId));
    setExpandedIds((current) => new Set(current).add(targetParentId));
  }

  /** Realizes a `canDrop`-legal `(targetId, position)`: reparent ("into") or same-parent reorder ("before"/"after"). */
  function drop(id: string, targetId: string, position: DropPosition) {
    if (!canDrop(nodes, id, targetId, position)) return;
    const { newParentId, beforeSiblingId } = resolveDrop(nodes, id, targetId, position);
    executeCommand(createMoveNodeCommand(id, newParentId, { beforeSiblingId }));
    if (position === "into") setExpandedIds((current) => new Set(current).add(targetId));
  }

  function handleDrop(targetId: string, position: DropPosition) {
    if (draggedId) drop(draggedId, targetId, position);
    setDraggedId(null);
    setDropIndicator(null);
  }

  const moveTargets =
    contextMenu?.mode === "move"
      ? nodes.filter((n) => n.type !== "page" && n.trashedAt == null && canReparent(nodes, contextMenu.nodeId, n.id))
      : [];

  // Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z (redo) for the structural
  // stack, window-scoped like a document-level shortcut rather than
  // requiring this pane to hold focus. Skipped while typing in the
  // rename `<input>` (or any other text field) so its own native
  // text-undo isn't hijacked.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // Row renderer handed to `react-window`'s `FixedSizeList` (NTA-56) —
  // same JSX/behavior the plain `rows.map(...)` used to build inline,
  // just addressed by `index` into `rows` instead of closing over one
  // `row` directly, since `FixedSizeList` only mounts this for the rows
  // currently scrolled into view.
  function renderRow({ index, style }: ListChildComponentProps) {
    const row = rows[index];
    const isDraggable = row.node.type !== "notebook";
    const indicatorForRow = dropIndicator?.targetId === row.node.id ? dropIndicator.position : null;
    const rowClassName = [
      "folder-tree__row",
      row.node.id === selectedFolderId && "folder-tree__row--selected",
      indicatorForRow === "into" && "folder-tree__row--drop-target",
      indicatorForRow === "before" && "folder-tree__row--drop-before",
      indicatorForRow === "after" && "folder-tree__row--drop-after",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        className={rowClassName}
        style={{ ...style, paddingLeft: `${row.depth * 1.1}em` }}
        draggable={isDraggable}
        onDragStart={() => isDraggable && setDraggedId(row.node.id)}
        onDragEnd={() => {
          setDraggedId(null);
          setDropIndicator(null);
        }}
        onDragOver={(e) => {
          if (!draggedId) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const offsetRatio = (e.clientY - rect.top) / rect.height;
          const position = dropZone(offsetRatio);
          if (canDrop(nodes, draggedId, row.node.id, position)) {
            e.preventDefault();
            setDropIndicator({ targetId: row.node.id, position });
          } else {
            setDropIndicator((current) => (current?.targetId === row.node.id ? null : current));
          }
        }}
        onDragLeave={() => setDropIndicator((current) => (current?.targetId === row.node.id ? null : current))}
        onDrop={(e) => {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const offsetRatio = (e.clientY - rect.top) / rect.height;
          handleDrop(row.node.id, dropZone(offsetRatio));
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
  }

  return (
    <div className="folder-tree" onClick={() => setContextMenu(null)}>
      <div className="folder-tree__undo-bar">
        <button type="button" disabled={!canUndo} onClick={() => undo()} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button type="button" disabled={!canRedo} onClick={() => redo()} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
      </div>

      {rows.length === 0 && <p className="folder-tree__empty">No notebooks yet.</p>}

      {rows.length > 0 && (
        <div className="folder-tree__viewport" ref={viewportRef}>
          <FixedSizeList
            height={viewportSize.height}
            width={viewportSize.width}
            itemCount={rows.length}
            itemSize={PANE_ROW_HEIGHT}
            itemKey={(index) => rows[index].node.id}
          >
            {renderRow}
          </FixedSizeList>
        </div>
      )}

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
