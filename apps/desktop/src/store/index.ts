// Zustand app state: current folder/page selection in the two navigation
// panes (docs/architecture.md §4.1, §5.4), and (phase 10) sync/connection
// status. Kept as one small store per concern rather than a single
// monolith.

import { create } from "zustand";

interface NavigationState {
  /** Selected node in the Folder Tree pane (a `notebook`/`folder` WorkspaceNode). */
  selectedFolderId: string | null;
  /** Currently open page in the Editor Canvas pane (a `page` WorkspaceNode). */
  activePageId: string | null;
  setSelectedFolder: (folderId: string | null) => void;
  setActivePage: (pageId: string | null) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  selectedFolderId: null,
  activePageId: null,
  setSelectedFolder: (folderId) => set({ selectedFolderId: folderId }),
  setActivePage: (pageId) => set({ activePageId: pageId }),
}));
