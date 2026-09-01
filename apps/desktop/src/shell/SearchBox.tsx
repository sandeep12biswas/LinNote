// NTA-56 — a minimal search box wired to `useSearchIndexStore`
// (../search/index.ts), so the incremental title/text index this ticket
// adds is reachable from the running app rather than a module nothing
// ever calls. Deliberately small: a text input plus a clickable results
// list, no keyboard navigation/highlighting beyond what those give for
// free — a fuller search experience (shortcuts, result previews, in-page
// term highlighting once page content is real) is future work, not
// scoped to this ticket.
//
// Selecting a result reuses ../store's existing navigation state — the
// same `selectedFolderId`/`activePageId` FolderTreePane.tsx/
// PageListPane.tsx already read — via ./searchNavigation.ts's pure
// "which folder does this result live under" resolution.

import { useMemo, useState } from "react";
import { useNavigationStore } from "../store";
import { useSearchIndexStore, type SearchResult } from "../search";
import { useWorkspaceTreeStore } from "../workspace";
import { resolveSearchResultSelection } from "./searchNavigation";

export function SearchBox() {
  const [query, setQuery] = useState("");

  const search = useSearchIndexStore((state) => state.search);
  // Not read directly, only subscribed to: forces `results` to
  // recompute after a create/rename/delete elsewhere in the app while a
  // query is still active, since MiniSearch mutates `index` in place
  // (see ../search/index.ts's `SearchIndexState.version` doc comment).
  const version = useSearchIndexStore((state) => state.version);
  const nodes = useWorkspaceTreeStore((state) => state.nodes);
  const setSelectedFolder = useNavigationStore((state) => state.setSelectedFolder);
  const setActivePage = useNavigationStore((state) => state.setActivePage);

  const results = useMemo(() => search(query), [search, query, version]);
  const trimmed = query.trim();

  function selectResult(result: SearchResult) {
    const { folderId, pageId } = resolveSearchResultSelection(nodes, result);
    setSelectedFolder(folderId);
    setActivePage(pageId);
    setQuery("");
  }

  return (
    <div className="search-box">
      <input
        type="search"
        className="search-box__input"
        placeholder="Search titles & pages…"
        aria-label="Search workspace"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {trimmed && (
        <ul className="search-box__results" role="listbox">
          {results.length === 0 && <li className="search-box__empty">No matches</li>}
          {results.map((result) => (
            <li key={result.id} role="option" aria-selected={false}>
              <button type="button" className="search-box__result" onClick={() => selectResult(result)}>
                <span className="search-box__result-title">{result.title}</span>
                <span className="search-box__result-type">{result.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
