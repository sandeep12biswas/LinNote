// NTA-52 — `Command` (./structuralUndoStack.ts) factories for the four
// structural mutations docs/architecture.md §3 calls out by name:
// `MoveNodeCommand`, `RenameNodeCommand`, `DeleteNodeCommand` (soft
// delete via `trashedAt`), and create. Each wraps a pure tree operation
// from ../workspace/index.ts with a snapshot of exactly what it's about
// to change, so `undo()` restores that snapshot verbatim rather than
// guessing an inverse operation (e.g. undoing a delete restores every
// affected node's prior `trashedAt`/`updatedAt`, not just "not trashed" —
// important for a descendant that was already trashed independently
// before the cascade touched it).
//
// Diff-based per-node snapshots (not a whole-tree copy per command),
// deliberately, matching canvas-core's own TODO(phase-8) "diff-based"
// command stack note — same shape, so Phase 8 (NTA-66) can unify the two
// stacks later instead of reconciling two different undo strategies.

import {
  createNode,
  deleteNode,
  getDescendantIds,
  getNode,
  moveNode,
  renameNode,
  useWorkspaceTreeStore,
  type CreateNodeInput,
  type MoveNodeOptions,
} from "../workspace";
import type { WorkspaceNode } from "../types";
import type { Command } from "./structuralUndoStack";

/** Replaces (or removes, when `node` is `null`) one node by id — the primitive every command below undoes/redoes with. */
function applyNodeSnapshot(nodes: WorkspaceNode[], id: string, node: WorkspaceNode | null): WorkspaceNode[] {
  const index = nodes.findIndex((n) => n.id === id);
  if (node == null) return index === -1 ? nodes : nodes.filter((n) => n.id !== id);
  if (index === -1) return [...nodes, node];
  const next = [...nodes];
  next[index] = node;
  return next;
}

function applySnapshots(nodes: WorkspaceNode[], snapshot: ReadonlyMap<string, WorkspaceNode | null>): WorkspaceNode[] {
  let next = nodes;
  for (const [id, node] of snapshot) next = applyNodeSnapshot(next, id, node);
  return next;
}

function setNodes(nodes: WorkspaceNode[]): void {
  useWorkspaceTreeStore.setState({ nodes });
}

function currentNodes(): WorkspaceNode[] {
  return useWorkspaceTreeStore.getState().nodes;
}

/**
 * `CreateNodeCommand`. Computes the new node up front (so callers get it
 * back synchronously, e.g. to immediately start renaming it) without
 * touching the store — nothing happens until `command.execute()` runs
 * through ../structuralUndoStack.ts's `useStructuralUndoStore.execute`.
 * Redo replays the exact same node (same id/order) rather than minting a
 * new one, so a redo after undo doesn't fork into a second node.
 */
export function createCreateNodeCommand(input: CreateNodeInput): { command: Command; node: WorkspaceNode } {
  const { node } = createNode(currentNodes(), input);

  const command: Command = {
    label: `Create ${input.type} "${input.title}"`,
    execute: () => setNodes(applyNodeSnapshot(currentNodes(), node.id, node)),
    undo: () => setNodes(applyNodeSnapshot(currentNodes(), node.id, null)),
  };

  return { command, node };
}

/** `RenameNodeCommand`. Undo restores the exact prior title/updatedAt. */
export function createRenameNodeCommand(id: string, title: string): Command {
  const before = getNode(currentNodes(), id);
  if (!before) throw new Error(`createRenameNodeCommand: unknown node id "${id}"`);

  return {
    label: `Rename "${before.title}" to "${title}"`,
    execute: () => setNodes(renameNode(currentNodes(), id, title)),
    undo: () => setNodes(applyNodeSnapshot(currentNodes(), id, before)),
  };
}

/** `MoveNodeCommand`. Undo restores the exact prior parentId/order — back to precisely where it was, not just "some position in the old parent". */
export function createMoveNodeCommand(id: string, newParentId: string | null, options?: MoveNodeOptions): Command {
  const before = getNode(currentNodes(), id);
  if (!before) throw new Error(`createMoveNodeCommand: unknown node id "${id}"`);

  return {
    label: `Move "${before.title}"`,
    execute: () => setNodes(moveNode(currentNodes(), id, newParentId, options)),
    undo: () => setNodes(applyNodeSnapshot(currentNodes(), id, before)),
  };
}

/**
 * `DeleteNodeCommand` — soft delete via `trashedAt`, cascading to every
 * descendant (../workspace/index.ts's `deleteNode`). Snapshots the whole
 * affected subtree *before* the cascade, so undo restores each
 * descendant's own prior `trashedAt` exactly — including one that was
 * already trashed independently beforehand — not just "untrash
 * everything touched".
 */
export function createDeleteNodeCommand(id: string): Command {
  const nodesBefore = currentNodes();
  const before = getNode(nodesBefore, id);
  if (!before) throw new Error(`createDeleteNodeCommand: unknown node id "${id}"`);

  const affectedIds = [id, ...getDescendantIds(nodesBefore, id)];
  const snapshot = new Map<string, WorkspaceNode | null>(
    affectedIds.map((affectedId) => [affectedId, getNode(nodesBefore, affectedId) ?? null]),
  );

  return {
    label: `Delete "${before.title}"`,
    execute: () => setNodes(deleteNode(currentNodes(), id)),
    undo: () => setNodes(applySnapshots(currentNodes(), snapshot)),
  };
}
