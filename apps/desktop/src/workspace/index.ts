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
// consume. `getAncestorChain` below (NTA-55) is the same kind of pure
// tree query, consumed by the breadcrumb trail above the editor canvas
// (../shell/breadcrumb.ts, ../shell/BreadcrumbTrail.tsx).
//
// NTA-52: structural operations (move/rename/delete/create) now have
// their own undo/redo stack — ../shell/structuralUndoStack.ts +
// ../shell/workspaceCommands.ts, which wrap the pure functions below
// (unchanged here) with undo-able `Command`s. `FolderTreePane`
// (../shell/FolderTreePane.tsx) routes through that stack instead of
// calling this store's create/rename/move/delete directly.
// NTA-53: `moveNode` supports precise same-parent drag-reorder via
// `beforeSiblingId` (any position, not just "append to the end"), and
// once a repeatedly-squeezed key grows past `REBALANCE_KEY_LENGTH_THRESHOLD`
// it triggers `rebalanceSiblings` automatically — §5.3's "occasional
// rebalance once keys get unreasonably long".
// NTA-54: `deleteNode` below cascades the soft delete (`trashedAt`) to
// every descendant, per §3's "Structural operations" note. This file
// also adds the rest of §5.5's trash model — `getTrashedNodes`,
// `restoreNode`, `purgeNode`, `emptyTrash`, `purgeExpiredTrash` — that
// ../shell/TrashPane.tsx (browse/restore/permanently-delete) consumes.

import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import { create } from "zustand";
// Type-only — see ./index.ts's own persistence-wiring functions at the
// bottom for why this file never imports a *value* from ../persistence
// (that would point the dependency arrow the wrong way; ../persistence's
// own header comment is explicit that everything else depends on it, not
// the reverse).
import type { PersistenceProvider } from "../persistence";
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

/**
 * The chain of ancestors from the root notebook down to `id` itself
 * (inclusive), root-first — e.g. `[notebook, folder, ..., page]`. Powers
 * the breadcrumb trail (NTA-55, ../shell/breadcrumb.ts): "notebook >
 * folder > ... > page". Empty array if `id` isn't in `nodes`.
 */
export function getAncestorChain(nodes: WorkspaceNode[], id: string): WorkspaceNode[] {
  const chain: WorkspaceNode[] = [];
  let current = getNode(nodes, id);
  while (current) {
    chain.unshift(current);
    current = current.parentId != null ? getNode(nodes, current.parentId) : undefined;
  }
  return chain;
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
   * Folder Tree pane (NTA-50) uses. A caller can also position `id`
   * immediately *after* a given sibling by passing that sibling's own
   * current next-sibling id here — see `resolveDrop` in
   * ../shell/folderTree.ts, which does exactly that for same-parent
   * drag-to-reorder (NTA-53).
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
 *
 * When the newly-generated key grows past `REBALANCE_KEY_LENGTH_THRESHOLD`
 * (repeatedly squeezing a key into the same gap between two neighbors —
 * the pathological case for any fractional-indexing scheme), this
 * rewrites every sibling's key evenly via `rebalanceSiblings` before
 * returning, per §5.3's "occasional rebalance once keys get unreasonably
 * long". That's the exception, not the common path: ordinary moves stay
 * the single-node write §5.3 asks for.
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
  // beforeIndex === -1 covers both "no beforeSiblingId given" and "given,
  // but not found among the new parent's current children" — either way,
  // per `MoveNodeOptions.beforeSiblingId`'s doc, that means append to the
  // end: anchor `before` to the current last sibling (mirrors createNode's
  // own append-to-end `lastOrder` pattern above), not `null`, which would
  // instead generate a key sorting *before* every existing sibling.
  const before =
    beforeIndex > 0
      ? siblings[beforeIndex - 1].order
      : beforeIndex === -1 && siblings.length > 0
        ? siblings[siblings.length - 1].order
        : null;
  const after = beforeIndex >= 0 ? siblings[beforeIndex].order : null;
  const order = generateKeyBetween(before, after);

  const moved = updateNode(nodes, id, {
    parentId: newParentId,
    order,
    updatedAt: new Date().toISOString(),
  });

  return needsRebalance(order) ? rebalanceSiblings(moved, newParentId) : moved;
}

/**
 * `generateKeyBetween` keys grow a little longer with every insert
 * squeezed into the same gap (e.g. repeatedly dragging a node back
 * between the same two siblings) — an inherent property of fractional
 * indexing, not a bug. This is the length past which §5.3 calls that
 * "unreasonably long" and asks for a rebalance; ordinary use (appending,
 * or a handful of same-gap reorders) stays well under it.
 */
export const REBALANCE_KEY_LENGTH_THRESHOLD = 60;

/** Whether `order` has grown past `REBALANCE_KEY_LENGTH_THRESHOLD` and is due for a rebalance. */
export function needsRebalance(order: string): boolean {
  return order.length > REBALANCE_KEY_LENGTH_THRESHOLD;
}

/**
 * Regenerates fresh, evenly-spaced `order` keys for every direct child
 * of `parentId` (trashed nodes included, so a rebalance never disturbs a
 * trashed node's position relative to its still-live siblings, only
 * shortens its key), preserving everyone's current relative order — the
 * "occasional rebalance" half of §5.3's ordering note. A full
 * sibling-group write, unlike every other structural op in this file;
 * `moveNode` above is the only caller, and only once `needsRebalance`
 * says a key has actually grown unreasonable.
 */
export function rebalanceSiblings(nodes: WorkspaceNode[], parentId: string | null): WorkspaceNode[] {
  const siblings = getChildren(nodes, parentId, { includeTrashed: true });
  if (siblings.length === 0) return nodes;

  const freshOrders = generateNKeysBetween(null, null, siblings.length);
  const now = new Date().toISOString();
  const nextOrderById = new Map(siblings.map((sibling, index) => [sibling.id, freshOrders[index]]));

  return nodes.map((n) =>
    nextOrderById.has(n.id) ? { ...n, order: nextOrderById.get(n.id) as string, updatedAt: now } : n,
  );
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

// ---- §5.5: Trash (NTA-54) -----------------------------------------------
//
// `deleteNode` above only ever soft-deletes: it stamps `trashedAt` on a
// node and every descendant, hiding them from `getChildren`/
// `getRootNodes` but never destroying data. The functions below are the
// rest of the trash lifecycle a Trash UI needs: browse what's there,
// restore it, or permanently remove it (one item, everything, or
// whatever has aged past the retention window).

/** How long a soft-deleted node sits in the trash before `purgeExpiredTrash` reclaims it, per §5.5's
 * "permanently removes content after a retention window" — not specified more precisely anywhere in
 * docs/architecture.md, so 30 days (a common OneNote/Drive-style default) is this ticket's call. */
export const TRASH_RETENTION_DAYS = 30;

/** True when `node`'s parent is itself trashed — i.e. `node` was pulled into the trash only because an
 * ancestor's `deleteNode` cascaded onto it, not because it's independently the thing the user asked to
 * delete. */
function hasTrashedParent(nodes: WorkspaceNode[], node: WorkspaceNode): boolean {
  if (node.parentId == null) return false;
  const parent = getNode(nodes, node.parentId);
  return parent != null && isTrashed(parent);
}

/**
 * The trashed nodes a Trash UI actually lists: only "trash roots" —
 * trashed nodes whose parent isn't itself trashed — most recently
 * deleted first. A cascade-trashed folder/notebook's own descendants
 * aren't listed as separate rows: `restoreNode`/`purgeNode` bring (or
 * take) the whole subtree along with its root, and listing a descendant
 * on its own would let it be "restored" while its still-trashed parent
 * stays invisible.
 */
export function getTrashedNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes
    .filter((n) => isTrashed(n) && !hasTrashedParent(nodes, n))
    .sort((a, b) => (b.trashedAt as string).localeCompare(a.trashedAt as string));
}

/**
 * Restores `id` and cascades the restore to every descendant — the
 * inverse of `deleteNode`'s cascade, so a whole cascade-trashed subtree
 * comes back together. A no-op when `id` isn't currently trashed (rather
 * than blindly cascading `trashedAt: null` onto descendants that may be
 * independently, still-legitimately trashed).
 */
export function restoreNode(nodes: WorkspaceNode[], id: string): WorkspaceNode[] {
  const target = getNode(nodes, id);
  if (!target || !isTrashed(target)) return nodes;
  const toRestore = new Set([id, ...getDescendantIds(nodes, id)]);
  const now = new Date().toISOString();
  return nodes.map((n) => (toRestore.has(n.id) ? { ...n, trashedAt: null, updatedAt: now } : n));
}

/**
 * Permanently removes `id` and every descendant from the tree — real
 * data loss, unlike `deleteNode`. Refuses on a node that isn't currently
 * trashed, so this can only be reached by first soft-deleting (via the
 * Trash UI's "Delete Permanently", never as a bypass for the ordinary
 * delete flow).
 */
export function purgeNode(nodes: WorkspaceNode[], id: string): WorkspaceNode[] {
  const target = getNode(nodes, id);
  if (!target) throw new Error(`purgeNode: unknown node id "${id}"`);
  if (!isTrashed(target)) throw new Error(`purgeNode: "${id}" is not in the trash — soft-delete it first`);
  const toPurge = new Set([id, ...getDescendantIds(nodes, id)]);
  return nodes.filter((n) => !toPurge.has(n.id));
}

/** Permanently removes every currently-trashed node (roots and cascaded descendants alike) — "Empty Trash". */
export function emptyTrash(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.filter((n) => !isTrashed(n));
}

/**
 * The "background sweep" from §5.5: permanently removes every trash root
 * older than `retentionDays` (default `TRASH_RETENTION_DAYS`), each
 * along with its cascaded descendants (via `purgeNode`). There's no
 * real scheduler yet — `useWorkspaceTreeStore` runs this once at store
 * creation and `../shell/TrashPane.tsx` runs it again on mount, standing
 * in for a periodic job until persistence (Phase 8, NTA-69) makes
 * `trashedAt` survive across sessions and a background sweep meaningful.
 */
export function purgeExpiredTrash(
  nodes: WorkspaceNode[],
  options: { retentionDays?: number; now?: Date } = {},
): WorkspaceNode[] {
  const retentionMs = (options.retentionDays ?? TRASH_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
  const cutoff = (options.now ?? new Date()).getTime() - retentionMs;

  let result = nodes;
  for (const root of getTrashedNodes(nodes)) {
    if (new Date(root.trashedAt as string).getTime() <= cutoff && getNode(result, root.id)) {
      result = purgeNode(result, root.id);
    }
  }
  return result;
}

// ---- Zustand wrapper ---------------------------------------------------

interface WorkspaceTreeState {
  nodes: WorkspaceNode[];
  createNode: (input: CreateNodeInput) => WorkspaceNode;
  renameNode: (id: string, title: string) => void;
  moveNode: (id: string, newParentId: string | null, options?: MoveNodeOptions) => void;
  deleteNode: (id: string) => void;
  restoreNode: (id: string) => void;
  purgeNode: (id: string) => void;
  emptyTrash: () => void;
  sweepExpiredTrash: (options?: { retentionDays?: number; now?: Date }) => void;
}

/**
 * The store the Folder Tree / Page List / Trash panes actually read from
 * and mutate through. Wraps the pure functions above around a single
 * `nodes` array, seeded from ./mockData.ts on first use — `purgeExpiredTrash`
 * runs once up front too (a no-op today since the seed has nothing
 * trashed, but the right thing once persisted `trashedAt` values can
 * come in already past the retention window).
 */
export const useWorkspaceTreeStore = create<WorkspaceTreeState>((set, get) => ({
  nodes: purgeExpiredTrash(createSeedWorkspaceNodes()),
  createNode: (input) => {
    const result = createNode(get().nodes, input);
    set({ nodes: result.nodes });
    return result.node;
  },
  renameNode: (id, title) => set({ nodes: renameNode(get().nodes, id, title) }),
  moveNode: (id, newParentId, options) => set({ nodes: moveNode(get().nodes, id, newParentId, options) }),
  deleteNode: (id) => set({ nodes: deleteNode(get().nodes, id) }),
  restoreNode: (id) => set({ nodes: restoreNode(get().nodes, id) }),
  purgeNode: (id) => set({ nodes: purgeNode(get().nodes, id) }),
  emptyTrash: () => set({ nodes: emptyTrash(get().nodes) }),
  sweepExpiredTrash: (options) => set({ nodes: purgeExpiredTrash(get().nodes, options) }),
}));

export { createSeedWorkspaceNodes } from "./mockData";

// ---- Persistence wiring (NTA-69/70, Phase 8) ----------------------------
// Lives here, not in ../persistence/, so ../persistence/ never has to
// import a *value* from this file (see the type-only import up top).
// ../App.tsx calls both once per app session, the same way it builds and
// activates the one real `PluginRegistry`.

/**
 * Loads the persisted tree at startup. A truly fresh workspace (no
 * `tree.json` yet — `persistence.readTree()` resolves `[]`) is seeded
 * with the same default notebook `useWorkspaceTreeStore` always started
 * from, and immediately persisted — the app must never open to a
 * dead-end empty Folder Tree with no node to right-click and no UI
 * anywhere (yet) to create a root-level notebook from scratch.
 */
export async function loadWorkspaceTree(persistence: PersistenceProvider): Promise<void> {
  const nodes = await persistence.readTree();
  if (nodes.length === 0) {
    const seeded = createSeedWorkspaceNodes();
    useWorkspaceTreeStore.setState({ nodes: seeded });
    await persistence.writeTree(seeded);
    return;
  }
  useWorkspaceTreeStore.setState({ nodes });
}

/**
 * Persists every subsequent tree mutation immediately (docs/architecture.md
 * §6: "tree ... mutations flush immediately"), not debounced the way page
 * edits are (../canvas-core/index.ts's `createNotePageAutosave`). Also
 * deletes a page's own persisted content (`persistence.deletePage`) for
 * every page-type node that just disappeared from the tree entirely —
 * `purgeNode`/`emptyTrash`/`purgeExpiredTrash` (permanently deleting from
 * trash) only ever touch `WorkspaceNode`s, so without this, a
 * permanently-deleted page's `pages/<id>.json` would silently linger on
 * disk forever, orphaned. A page merely *soft*-deleted (`deleteNode`,
 * still in `nodes` with `trashedAt` set, restorable) is untouched — its
 * content must survive a restore. Call once per app session; returns the
 * zustand unsubscribe function.
 */
export function wireWorkspaceTreeAutosave(persistence: PersistenceProvider): () => void {
  return useWorkspaceTreeStore.subscribe((state, prevState) => {
    if (state.nodes === prevState.nodes) return; // no structural mutation happened

    const stillPresent = new Set(state.nodes.map((node) => node.id));
    for (const node of prevState.nodes) {
      if (node.type === "page" && !stillPresent.has(node.id)) {
        persistence.deletePage(node.id).catch((error) => {
          console.error(`[autosave] failed to delete pages/${node.id}.json`, error);
        });
      }
    }

    persistence.writeTree(state.nodes).catch((error) => {
      console.error("[autosave] failed to write tree.json", error);
    });
  });
}
