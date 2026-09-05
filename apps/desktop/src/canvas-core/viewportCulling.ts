// NTA-76 (Phase 9): "Segments far outside the viewport unmount from the
// DOM while their state is retained in the model." Pure geometry only —
// ./SegmentLayerHost.tsx is the one place that actually filters the
// `segments` array it hands to @linnote/plugin-element-text-segment's
// `SegmentLayer` using this; `useNotePageStore`'s own `elements` array
// (the model, ./index.ts) is never filtered — an off-screen segment is
// exactly as "real" as an on-screen one, it just isn't mounted, so
// nothing about undo/redo, autosave, or the coalescers in ./coalescer.ts
// (which read/write the store directly, never the filtered prop) needs
// to change for this.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Overscan margin, in canvas-space units — a segment doesn't unmount the
 * instant it crosses the visible edge, only once it's this far past it.
 * Without a margin, a segment sitting right at the boundary would
 * mount/unmount on every render during a slow pan (each one resetting
 * its TipTap/ProseMirror editor) instead of just once when it's
 * genuinely out of view.
 */
export const VIEWPORT_CULL_MARGIN = 400;

/**
 * True if `rect` intersects `visibleRect` expanded by `margin` on every
 * side — false only once `rect` is entirely past the margin.
 */
export function isRectVisible(rect: Rect, visibleRect: Rect, margin: number): boolean {
  const left = visibleRect.x - margin;
  const top = visibleRect.y - margin;
  const right = visibleRect.x + visibleRect.width + margin;
  const bottom = visibleRect.y + visibleRect.height + margin;
  return rect.x < right && rect.x + rect.width > left && rect.y < bottom && rect.y + rect.height > top;
}
