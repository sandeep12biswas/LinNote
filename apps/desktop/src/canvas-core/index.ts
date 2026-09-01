// Canvas core, per open page — docs/architecture.md §6, §11, §13:
// - Page Document Model (../../types#NotePage) — the open, plugin-extensible
//   `elements: CanvasElement[]` union.
// - Viewport Transform: single `{ x, y, scale }` source of truth; pan/zoom
//   rescales around the pointer's canvas-space position.
// - Command Stack: one linear undo/redo stack per open page, shared across
//   every plugin's mutating actions (ink, segment moves, formatting,
//   inserted elements) — distinct from the workspace-level structural undo
//   stack (§5.5, owned by ../shell/).
//
// This file implements NTA-33's two foundations, split like
// ../workspace/index.ts's own pure-functions-plus-zustand-wrapper
// pattern (its header comment explains the split; mirrored here):
//
// 1. **In-memory `NotePage` store** — `useNotePageStore` below, seeded
//    from ./mockData.ts. Persistence (`readPage`/`writePage`) is
//    deliberately "not implemented" until Phase 8/NTA-69 (see
//    ../persistence/index.ts), so this is in-memory only, same scope
//    note as NTA-49's workspace tree store. `getOrCreatePage` is the
//    pure function a page-open flow calls; `ensurePage` is the store
//    action wrapping it (mirrors `createNode`/`useWorkspaceTreeStore` in
//    ../workspace/index.ts) — it caches a synthesized blank page into
//    the store on first open rather than fabricating a fresh object
//    every call, so a newly-created page (e.g. via NTA-52's
//    `createNode`) opens without 404-ing and stays stable across
//    re-renders/re-opens.
//
// 2. **Viewport pan/zoom math** — `panViewport`/`zoomViewport` below,
//    pure functions over the `Viewport` type; `./CanvasViewport.tsx` is
//    the React render surface that wires pointer/wheel events to them
//    and mounts into ../shell/AppShell.tsx's Editor Canvas pane.
//    **Decided**: one `Viewport` per *open* page, reset to
//    `DEFAULT_VIEWPORT` on every page switch — nothing persists a
//    per-page pan/zoom position yet (no ticket owns that), so
//    `CanvasViewport` just resets on its `pageId` prop changing rather
//    than pretending a per-page viewport cache exists. Revisit if a
//    later ticket wants "reopen a page where you left the view."
//
// TODO(phase-8): Command stack (§13), diff-based, capped at ~200 entries.

import { create } from "zustand";
import { suggestTextColor } from "@linnote/contrast-util";
import type { CanvasElement, NotePage } from "../types";
import { createSeedNotePages, DEFAULT_BACKGROUND_COLOR } from "./mockData";

// ---- Viewport: pan/zoom transform (NTA-33) --------------------------------

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

/** Clamp bounds for `scale` — arbitrary but generous; keeps a runaway wheel delta from zooming to nothing/infinity. */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Pointer-drag pan: translates `x`/`y` by the drag delta, unaffected by `scale`. */
export function panViewport(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

/**
 * Rescales `viewport` by `factor` (>1 zooms in, <1 zooms out), anchored so
 * the point currently under `(pointerX, pointerY)` — in the render
 * surface's own local (screen) coordinates — stays under the pointer
 * after the rescale, per docs/architecture.md §5's "pan/zoom rescales
 * around the pointer position, not the canvas origin".
 *
 * The render surface applies `translate(x, y) scale(scale)`, so
 * `screen = viewport.xy + canvasPoint * scale`, i.e.
 * `canvasPoint = (screen - viewport.xy) / scale`. Solving for the new
 * `x`/`y` that keeps `canvasPoint` fixed under the same screen point
 * after `scale` changes to `nextScale`:
 *
 *   nextXY = pointerXY - (pointerXY - viewport.xy) * (nextScale / scale)
 *
 * `factor` is the requested change, but `nextScale` may differ after
 * clamping to `[MIN_SCALE, MAX_SCALE]` — the *applied* ratio (not the
 * requested `factor`) is what the anchor math above must use, or the
 * anchor point drifts once either clamp bound is hit.
 */
export function zoomViewport(viewport: Viewport, pointerX: number, pointerY: number, factor: number): Viewport {
  const nextScale = clamp(viewport.scale * factor, MIN_SCALE, MAX_SCALE);
  const appliedFactor = nextScale / viewport.scale;
  return {
    x: pointerX - (pointerX - viewport.x) * appliedFactor,
    y: pointerY - (pointerY - viewport.y) * appliedFactor,
    scale: nextScale,
  };
}

// ---- NotePage store (NTA-33) ----------------------------------------------

/** A brand-new, empty page for `id` — same shape/defaults as ./mockData.ts's seed pages, just untitled and empty. */
export function createBlankNotePage(id: string): NotePage {
  const now = new Date().toISOString();
  return {
    id,
    header: { title: "Untitled Page", align: "left" },
    background: {
      kind: "color",
      color: DEFAULT_BACKGROUND_COLOR,
      suggestedTextColor: suggestTextColor(DEFAULT_BACKGROUND_COLOR),
    },
    elements: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get-or-create: returns `id`'s existing page from `pages` unchanged, or
 * synthesizes a fresh blank one via `createBlankNotePage` and returns it
 * alongside a `pages` map that now caches it. Pure — like
 * ../workspace/index.ts's `createNode`, the zustand wrapper below is what
 * actually commits the returned `pages` back into the store.
 */
export function getOrCreatePage(
  pages: Record<string, NotePage>,
  id: string,
): { pages: Record<string, NotePage>; page: NotePage } {
  const existing = pages[id];
  if (existing) return { pages, page: existing };
  const page = createBlankNotePage(id);
  return { pages: { ...pages, [id]: page }, page };
}

/**
 * Pure: returns a new `NotePage` with `element` appended to `elements`
 * and `updatedAt` bumped — `addElement` below's zustand wrapper, mirrors
 * `getOrCreatePage`'s pure-function-plus-store-action split above.
 */
export function addElementToPage(page: NotePage, element: CanvasElement): NotePage {
  return { ...page, elements: [...page.elements, element], updatedAt: new Date().toISOString() };
}

/**
 * Pure: returns a new `NotePage` with the element matching `elementId`
 * replaced by `updater(element)` — a no-op (same `page` reference) if no
 * element with that id exists. `updateElement` below's zustand wrapper.
 */
export function updateElementInPage(
  page: NotePage,
  elementId: string,
  updater: (element: CanvasElement) => CanvasElement,
): NotePage {
  if (!page.elements.some((element) => element.id === elementId)) return page;
  return {
    ...page,
    elements: page.elements.map((element) => (element.id === elementId ? updater(element) : element)),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Pure: returns a new `NotePage` with `header` replaced by
 * `updater(header)` and `updatedAt` bumped — `updateHeader` below's
 * zustand wrapper. `header` always exists (unlike an element, which may
 * or may not be present), so there's no "does it exist" branch here the
 * way `updateElementInPage` has.
 */
export function updateHeaderInPage(page: NotePage, updater: (header: NotePage["header"]) => NotePage["header"]): NotePage {
  return { ...page, header: updater(page.header), updatedAt: new Date().toISOString() };
}

/**
 * Pure: returns a new `NotePage` with `background.color` set to `color`
 * (kind forced to `"color"` — NTA-35 is the color picker only, not a
 * pattern switcher) and `suggestedTextColor` recomputed via
 * `@linnote/contrast-util`'s `suggestTextColor` for the new color.
 * `setBackgroundColor` below's zustand wrapper.
 */
export function setBackgroundColorInPage(page: NotePage, color: string): NotePage {
  return {
    ...page,
    background: { ...page.background, kind: "color", color, suggestedTextColor: suggestTextColor(color) },
    updatedAt: new Date().toISOString(),
  };
}

interface NotePageState {
  pages: Record<string, NotePage>;
  /**
   * Get-or-create for `id`, caching a synthesized blank page into the
   * store the first time it's requested — call this (not a plain
   * selector) whenever a page is opened, so a page id with no seed/saved
   * data yet (e.g. one just created via NTA-52's `createNode`) resolves
   * to a stable object instead of a fresh one on every call/render.
   */
  ensurePage: (id: string) => NotePage;
  /**
   * Appends `element` onto `id`'s page — get-or-creates the page first
   * (same as `ensurePage`) so inserting into a page that hasn't been
   * opened yet doesn't throw. The one mutating action a
   * CanvasElement-inserting plugin calls (NTA-37's create-on-type
   * gesture today, via ./SegmentLayerHost.tsx). Direct `set()`, no
   * undo-stack entry yet — see this file's `TODO(phase-8)` header note.
   */
  addElement: (id: string, element: CanvasElement) => void;
  /**
   * Replaces one element on `id`'s page via `updater`, e.g. a segment's
   * rich-text `content` changing on every keystroke. No-ops if `id`'s
   * page hasn't been opened/created yet or has no element with that id.
   */
  updateElement: (id: string, elementId: string, updater: (element: CanvasElement) => CanvasElement) => void;
  /**
   * Replaces `id`'s page `header` via `updater` — NTA-34's `PageHeader`
   * (./PageHeader.tsx) calls this on every title keystroke, date
   * toggle, and alignment change. Get-or-creates the page first (same
   * as `addElement`) so editing a page's header before anything else
   * has touched it doesn't throw.
   */
  updateHeader: (id: string, updater: (header: NotePage["header"]) => NotePage["header"]) => void;
  /**
   * Sets `id`'s page background to `color` (and recomputes
   * `suggestedTextColor` alongside it) — NTA-35's `BackgroundPicker`
   * (./BackgroundPicker.tsx) calls this on every color change.
   * Get-or-creates the page first (same as `addElement`/`updateHeader`).
   */
  setBackgroundColor: (id: string, color: string) => void;
}

/**
 * The store `CanvasViewport` (./CanvasViewport.tsx) and later editor
 * subtasks (NTA-34's header, NTA-37+'s segment blocks) read the open
 * page's content from, seeded from ./mockData.ts on first use — mirrors
 * ../workspace/index.ts's `useWorkspaceTreeStore`. In-memory only per
 * this file's header comment; Phase 8/NTA-69 replaces the seed +
 * `ensurePage` synthesis with real `PersistenceProvider.readPage()`
 * calls behind the same shape.
 */
export const useNotePageStore = create<NotePageState>((set, get) => ({
  pages: createSeedNotePages(),
  ensurePage: (id) => {
    const result = getOrCreatePage(get().pages, id);
    if (result.pages !== get().pages) set({ pages: result.pages });
    return result.page;
  },
  addElement: (id, element) => {
    const { pages: withPage, page } = getOrCreatePage(get().pages, id);
    set({ pages: { ...withPage, [id]: addElementToPage(page, element) } });
  },
  updateElement: (id, elementId, updater) => {
    const page = get().pages[id];
    if (!page) return;
    set({ pages: { ...get().pages, [id]: updateElementInPage(page, elementId, updater) } });
  },
  updateHeader: (id, updater) => {
    const { pages: withPage, page } = getOrCreatePage(get().pages, id);
    set({ pages: { ...withPage, [id]: updateHeaderInPage(page, updater) } });
  },
  setBackgroundColor: (id, color) => {
    const { pages: withPage, page } = getOrCreatePage(get().pages, id);
    set({ pages: { ...withPage, [id]: setBackgroundColorInPage(page, color) } });
  },
}));

export { createSeedNotePages, DEFAULT_BACKGROUND_COLOR } from "./mockData";
export { CanvasViewport, useCanvasCoordinates } from "./CanvasViewport";
export type { CanvasCoordinates, CanvasPoint, CanvasViewportProps } from "./CanvasViewport";
export { SegmentLayerHost } from "./SegmentLayerHost";
export { PageHeader } from "./PageHeader";
export { BackgroundPicker } from "./BackgroundPicker";
