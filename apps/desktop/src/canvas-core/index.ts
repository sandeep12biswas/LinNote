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
// TODO(phase-3): viewport transform + infinite pan/zoom.
// TODO(phase-8): Command stack (§13), diff-based, capped at ~200 entries.

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}
