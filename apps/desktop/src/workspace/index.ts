// NTA-49 — the in-memory WorkspaceNode tree store (docs/architecture.md
// §3, mirrors the Notion "Desing architecture" page's §5.1-5.2): one
// adjacency-list tree, not a mirrored folder structure. Renaming/moving a
// node is an O(1) metadata write (only `parentId`/`order`/`title`
// change) — content itself is stored flat, named by id, and never
// touched by a structural operation.
//
// `FileSystemPersistenceProvider.readTree()`/`writeTree()`
// (../persistence/index.ts) are explicitly out of scope here — that's
// Phase 8 (NTA-69) and currently throws "not implemented" on purpose.
// This store works in-memory, seeded from ./mockData.ts, matching how
// NTA-14 scoped persistence narrowly rather than pretending Phase 8 work
// is done.
//
// Split, like ../shell/index.ts's `buildMenuBar`/`MenuBar`: pure tree
// operations below (plain functions over a `WorkspaceNode[]`, easy to
// unit test without React or zustand) plus a thin zustand wrapper
// (`useWorkspaceTreeStore`) that the Folder Tree / Page List panes
// (../shell/FolderTreePane.tsx, ../shell/PageListPane.tsx) actually
// consume.
//
// TODO(NTA-52): structural operations (move/rename/delete/create) aren't
// on their own undo stack yet — a separate subtask of the same parent
// story (NTA-43) as this one.
// TODO(NTA-53): `moveNode`'s ordering only supports "append to the end"
// or a caller-supplied `beforeSiblingId` — full fractional-index
// same-parent drag-reorder polish is that subtask, not this one.
// TODO(NTA-54): `deleteNode` below does cascade a soft delete
// (`trashedAt`) to every descendant, per §3's "Structural operations"
// note, but a trash UI (browse/restore/permanently-delete) is that
// subtask.

import { generateKeyBetween } from "fractional-indexing";
import { create } from "zustand";
import type { NodeType, WorkspaceNode } from "../types";
import { createSeedWorkspaceNodes } from "./mockData";

// ---- Pure tree operations --------------------------------------------

function isTrashed(node: WorkspaceNode): boolean {
  return node.trashedAt != null;
}

export function getNode(nodes: WorkspaceNode[], id: string): WorkspaceNode | undefined {
  return nodes.find((n) => n.id === id);
}

/**
 * Direct children of `parentId` (or root-level nodes, for `null`),
 * sorted by `order` — `fractional-indexing` keys are designed to sort
 * correctly as plain strings. Trashed nodes are excluded by default
 * (§3's soft delete); pass `includeTrashed: true` for a future
 * trash-browsing UI (NTA-54).
 */
export function getChildren(
  nodes: WorkspaceNode[],
  parentId: string | null,
  options: { includeTrashed?: boolean } = {},
): WorkspaceNode[] {
  return nodes
    .filter((n) => n.parentId === parentId && (options.includeTrashed || !isTrashed(n)))
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
}

export function getRootNodes(nodes: WorkspaceNode[], options?: { includeTrashed?: boolean }): WorkspaceNode[] {
  return getChildren(nodes, null, options);
}

/** Every descendant id of `id` (children, grandchildren, ...) — not including `id` itself. */
export function getDescendantIds(nodes: WorkspaceNode[], id: string): string[] {
  const result: string[] = [];
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const child of nodes.filter((n) => n.parentId === current)) {
      result.push(child.id);
      stack.push(child.id);
    }
  }
  return result;
}

/** True when `maybeDescendantId` is `ancestorId` itself, or nested anywhere under it. */
export function isSelfOrDescendant(nodes: WorkspaceNode[], ancestorId: string, maybeDescendantId: string): boolean {
  return ancestorId === maybeDescendantId || getDescendantIds(nodes, ancestorId).includes(maybeDescendantId);
}

export interface CreateNodeInput {
  parentId: string | null;
  type: NodeType;
  title: string;
  icon?: string;
  color?: string;
}

/** Appends a new node as the last sibling among `parentId`'s current children. */
export function createNode(
  nodes: WorkspaceNode[],
  input: CreateNodeInput,
): { nodes: WorkspaceNode[]; node: WorkspaceNode } {
  const siblings = getChildren(nodes, input.parentId, { includeTrashed: true });
  const lastOrder = siblings.length > 0 ? siblings[siblings.length - 1].order : null;
  const now = new Date().toISOString();
  const node: WorkspaceNode = {
    id: crypto.randomUUID(),
    parentId: input.parentId,
    type: input.type,
    title: input.title,
    order: generateKeyBetween(lastOrder, null),
    icon: input.icon,
    color: input.color,
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
  };
  return { nodes: [...nodes, node], node };
}

/** Rename is an O(1) metadata write — only `title`/`updatedAt` change. */
export function renameNode(nodes: WorkspaceNode[], id: string, title: string): WorkspaceNode[] {
  return updateNode(nodes, id, { title, updatedAt: new Date().toISOString() });
}

export interface MoveNodeOptions {
  /**
   * Insert before this sibling's current position under `newParentId`.
   * Omitted (or not found among the new parent's children) appends to
   * the end — the common "drop onto a folder to reparent" case that the
   * Folder Tree pane (NTA-50) uses; precise same-parent reorder-by-drag
   * is NTA-53.
   */
  beforeSiblingId?: string;
}

/**
 * Reparents `id` under `newParentId` — an O(1) metadata write (only
 * `parentId`/`order`/`updatedAt` change, per §3's "renaming/moving is an
 * O(1) metadata write"). Refuses to move a node into itself or one of
 * its own descendants (would disconnect that subtree from the tree
 * entirely), and refuses to give a `notebook` a non-null parent (§3:
 * "parentId: null only for root-level notebooks").
 */
export function moveNode(
  nodes: WorkspaceNode[],
  id: string,
  newParentId: string | null,
  options: MoveNodeOptions = {},
): WorkspaceNode[] {
  if (newParentId != null) {
    const moving = getNode(nodes, id);
    if (moving?.type === "notebook") {
      throw new Error(`moveNode: "${id}" is a notebook and must stay root-level (parentId: null)`);
    }
    if (isSelfOrDescendant(nodes, id, newParentId)) {
      throw new Error(`moveNode: cannot move "${id}" into itself or one of its own descendants`);
    }
  }

  const siblings = getChildren(nodes, newParentId, { includeTrashed: true }).filter((n) => n.id !== id);
  const beforeIndex = options.beforeSiblingId ? siblings.findIndex((n) => n.id === options.beforeSiblingId) : -1;
  const before = beforeIndex > 0 ? siblings[beforeIndex - 1].order : null;
  const after = beforeIndex >= 0 ? siblings[beforeIndex].order : null;

  return updateNode(nodes, id, {
    parentId: newParentId,
    order: generateKeyBetween(before, after),
    updatedAt: new Date().toISOString(),
  });
}

/** Soft-deletes `id` and cascades `trashedAt` to every descendant, in one pass (§3's cascade note). */
export function deleteNode(nodes: WorkspaceNode[], id: string): WorkspaceNode[] {
  const toTrash = new Set([id, ...getDescendantIds(nodes, id)]);
  const now = new Date().toISOString();
  return nodes.map((n) => (toTrash.has(n.id) ? { ...n, trashedAt: now, updatedAt: now } : n));
}

function updateNode(nodes: WorkspaceNode[], id: string, patch: Partial<WorkspaceNode>): WorkspaceNode[] {
  const index = nodes.findIndex((n) => n.id === id);
  if (index === -1) throw new Error(`updateNode: unknown node id "${id}"`);
  const next = [...nodes];
  next[index] = { ...next[index], ...patch };
  return next;
}

// ---- Zustand wrapper ---------------------------------------------------

interface WorkspaceTreeState {
  nodes: WorkspaceNode[];
  createNode: (input: CreateNodeInput) => WorkspaceNode;
  renameNode: (id: string, title: string) => void;
  moveNode: (id: string, newParentId: string | null, options?: MoveNodeOptions) => void;
  deleteNode: (id: string) => void;
}

/**
 * The store the Folder Tree / Page List panes actually read from and
 * mutate through. Wraps the pure functions above around a single
 * `nodes` array, seeded from ./mockData.ts on first use.
 */
export const useWorkspaceTreeStore = create<WorkspaceTreeState>((set, get) => ({
  nodes: createSeedWorkspaceNodes(),
  createNode: (input) => {
    const result = createNode(get().nodes, input);
    set({ nodes: result.nodes });
    return result.node;
  },
  renameNode: (id, title) => set({ nodes: renameNode(get().nodes, id, title) }),
  moveNode: (id, newParentId, options) => set({ nodes: moveNode(get().nodes, id, newParentId, options) }),
  deleteNode: (id) => set({ nodes: deleteNode(get().nodes, id) }),
}));

export { createSeedWorkspaceNodes } from "./mockData";
