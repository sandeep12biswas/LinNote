// Zustand app state: current notebook/section/page selection, open pages,
// and (phase 5) sync/connection status. Kept as one small store per
// concern rather than a single monolith.

import { create } from "zustand";

interface NavigationState {
  activeNotebookId: string | null;
  activeSectionId: string | null;
  activePageId: string | null;
  setActivePage: (pageId: string | null) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeNotebookId: null,
  activeSectionId: null,
  activePageId: null,
  setActivePage: (pageId) => set({ activePageId: pageId }),
}));
