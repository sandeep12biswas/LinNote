// Incremental title/text search index — NTA-56 (docs/architecture.md §3's
// "an incremental search index (MiniSearch) over titles/extracted text"
// and §6's "workspace search runs off an in-memory MiniSearch index built
// at startup/on save, not SQL full-text search"). Implements the
// TODO(phase-2) left in ../persistence/index.ts.
//
// Wraps `minisearch` (already an `apps/desktop` dependency, per
// docs/architecture.md's tool inventory) around the `WorkspaceNode` tree
// (../workspace/): one document per non-trashed node, indexed by `title`
// (real today) and `text` (page content — see below).
//
// Split like ../workspace/index.ts and ../shell/folderTree.ts: pure
// functions over a `MiniSearch` instance (easy to unit test without React
// or zustand) plus a thin zustand wrapper (`useSearchIndexStore`) that
// ../shell/SearchBox.tsx actually consumes.
//
// "Incremental", concretely: `syncSearchIndex` below diffs two consecutive
// `WorkspaceNode[]` snapshots and issues MiniSearch add/replace/discard
// calls only for the handful of nodes that actually changed — the index
// is built once at startup (`buildSearchIndex`, "tree index loads at
// startup" per the ticket) and then kept current incrementally as
// `useWorkspaceTreeStore` mutates, never torn down and rebuilt wholesale
// on every keystroke.
//
// TODO(phase-3/phase-8): `text` is real once a page's content is
// extractable and `PersistenceProvider.readPage`/`writePage` are real
// (../persistence/index.ts currently throws "not implemented" for both —
// that's Phase 8, NTA-69 — and the Editor Canvas that would produce
// extractable text doesn't exist yet either — Phase 3, NTA-33+). Until
// then every document's `text` field is `""`; `indexPageText`/
// `useSearchIndexStore.indexPageText` are wired and unit-tested so that
// whichever of those lands first can start feeding real content into the
// existing index without any change to this module's schema or API.

import MiniSearch from "minisearch";
import { create } from "zustand";
import type { NodeType, WorkspaceNode } from "../types";
import { useWorkspaceTreeStore } from "../workspace";

export interface SearchDocument {
  id: string;
  title: string;
  text: string;
  type: NodeType;
}

export interface SearchResult {
  id: string;
  title: string;
  type: NodeType;
  score: number;
}

const SEARCH_FIELDS: Array<keyof SearchDocument> = ["title", "text"];
const STORED_FIELDS: Array<keyof SearchDocument> = ["id", "title", "type", "text"];

// Prefix matching (so "road" finds "Roadmap" while typing) and a little
// fuzziness (typo tolerance), with `title` weighted above extracted `text`
// so a title hit always outranks a body-text hit for the same query.
const SEARCH_OPTIONS = { prefix: true, fuzzy: 0.2, boost: { title: 2 } };

function isTrashed(node: WorkspaceNode): boolean {
  return node.trashedAt != null;
}

function toDocument(node: WorkspaceNode, text: string): SearchDocument {
  return { id: node.id, title: node.title, text, type: node.type };
}

/** The `text` currently stored for `id`, or `""` if the id isn't indexed or has none yet. */
function storedTextOf(index: MiniSearch<SearchDocument>, id: string): string {
  const stored = index.getStoredFields(id);
  return typeof stored?.text === "string" ? stored.text : "";
}

/** A fresh, empty index sharing the schema/search options every index in this module uses. */
export function createEmptySearchIndex(): MiniSearch<SearchDocument> {
  return new MiniSearch<SearchDocument>({
    idField: "id",
    fields: SEARCH_FIELDS,
    storeFields: STORED_FIELDS,
    searchOptions: SEARCH_OPTIONS,
  });
}

/**
 * Builds an index from scratch — used once, when the store below is
 * created ("tree index loads at startup", per the ticket). Trashed nodes
 * (§5.5 soft delete) are excluded, matching `getChildren`'s default in
 * ../workspace/index.ts.
 */
export function buildSearchIndex(nodes: WorkspaceNode[]): MiniSearch<SearchDocument> {
  const index = createEmptySearchIndex();
  index.addAll(nodes.filter((node) => !isTrashed(node)).map((node) => toDocument(node, "")));
  return index;
}

/**
 * Diffs `previous` against `next` (two consecutive `useWorkspaceTreeStore`
 * snapshots) and applies only the MiniSearch add/replace/discard calls
 * needed to bring `index` up to date — the incremental half of this
 * ticket. A node's `text` (once real) is preserved across a title-only
 * rename by round-tripping it through `getStoredFields`, so renaming a
 * page never throws away its already-indexed body text.
 *
 * Known limitation: discarding a node (delete, or trashing it) drops its
 * stored `text` along with it, so restoring a trashed node from a future
 * trash UI (NTA-54) re-adds it with `text: ""` until it's re-opened.
 * Acceptable for now — there's no trash-restore UI yet to hit this case.
 */
export function syncSearchIndex(
  index: MiniSearch<SearchDocument>,
  previous: readonly WorkspaceNode[],
  next: readonly WorkspaceNode[],
): void {
  const previousById = new Map(previous.map((node) => [node.id, node]));

  for (const node of next) {
    const before = previousById.get(node.id);
    const trashed = isTrashed(node);
    const wasIndexed = index.has(node.id);

    if (trashed) {
      if (wasIndexed) index.discard(node.id);
      continue;
    }

    if (!wasIndexed) {
      // Newly created, or restored out of trash — see the "known
      // limitation" note above for the latter case.
      index.add(toDocument(node, ""));
    } else if (!before || before.title !== node.title) {
      index.replace(toDocument(node, storedTextOf(index, node.id)));
    }
  }

  // Defensive: `deleteNode` (../workspace/index.ts) only ever soft-deletes
  // (handled above via `trashed`), so nodes don't normally disappear from
  // the array outright — but don't leave a stale entry indexed if one ever
  // does.
  const nextIds = new Set(next.map((node) => node.id));
  for (const node of previous) {
    if (!nextIds.has(node.id) && index.has(node.id)) index.discard(node.id);
  }
}

/**
 * Updates the extracted `text` for an already-indexed, non-trashed node,
 * leaving `title`/`type` as currently indexed. A no-op for an unknown or
 * trashed id — see the module doc's TODO(phase-3/phase-8): nothing calls
 * this yet, since there's no page content to extract text from.
 */
export function indexPageText(index: MiniSearch<SearchDocument>, nodeId: string, text: string): void {
  if (!index.has(nodeId)) return;
  const stored = index.getStoredFields(nodeId);
  const title = typeof stored?.title === "string" ? stored.title : "";
  const type = typeof stored?.type === "string" ? (stored.type as NodeType) : "page";
  index.replace({ id: nodeId, title, text, type });
}

/** Runs `query` against `index`, returning ranked results. `""`/whitespace-only queries return no results. */
export function searchWorkspace(index: MiniSearch<SearchDocument>, query: string): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return index.search(trimmed).map((result) => ({
    id: String(result.id),
    title: typeof result.title === "string" ? result.title : "",
    type: typeof result.type === "string" ? (result.type as NodeType) : "page",
    score: result.score,
  }));
}

// ---- Zustand wrapper -----------------------------------------------------

interface SearchIndexState {
  index: MiniSearch<SearchDocument>;
  /**
   * Bumped on every change applied to `index`. `MiniSearch` mutates in
   * place, so zustand (which re-renders subscribers on reference
   * inequality) can't otherwise tell a search-affecting change happened —
   * components that need to react to one (e.g. re-running a still-open
   * query after a rename) should subscribe to this alongside `search`.
   */
  version: number;
  search: (query: string) => SearchResult[];
  indexPageText: (pageId: string, text: string) => void;
}

/**
 * The store ../shell/SearchBox.tsx actually reads from. Seeded from
 * `useWorkspaceTreeStore`'s current nodes at creation time (the "tree
 * index loads at startup" half of the ticket) and then kept incrementally
 * in sync via the subscription below (the "incremental" half).
 */
export const useSearchIndexStore = create<SearchIndexState>((set, get) => ({
  index: buildSearchIndex(useWorkspaceTreeStore.getState().nodes),
  version: 0,
  search: (query) => searchWorkspace(get().index, query),
  indexPageText: (pageId, text) => {
    indexPageText(get().index, pageId, text);
    set((state) => ({ version: state.version + 1 }));
  },
}));

// Keep the index incrementally in sync with the workspace tree store,
// for the lifetime of the app — every `useWorkspaceTreeStore` mutation
// (create/rename/move/delete) runs `syncSearchIndex` against just the
// nodes that changed, per this module's doc comment above.
useWorkspaceTreeStore.subscribe((state, previousState) => {
  syncSearchIndex(useSearchIndexStore.getState().index, previousState.nodes, state.nodes);
  useSearchIndexStore.setState((current) => ({ version: current.version + 1 }));
});
