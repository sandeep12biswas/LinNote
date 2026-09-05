// Pure, host-independent ink logic (NTA-91 stroke math, NTA-93 eraser) —
// perfect-freehand outline generation, stroke bounds, and eraser hit-
// testing/splitting. No React, no canvas 2D context here — those live in
// ./InkLayer.tsx, which composes these. Kept separate the same way
// plugins/element-text-segment/src/SegmentLayer.tsx exports its own pure
// helpers (resolveNonOverlap, isPointInsideSegment, ...) rather than
// folding all the geometry into the component file — and, unlike that
// file's collision math, every function here is fully unit-testable
// (ink.test.ts) with no jsdom limitation to work around.

import { getStroke } from "perfect-freehand";

export interface InkPoint {
  x: number;
  y: number;
  pressure: number;
  t: number;
}

export type InkTool = "pen" | "highlighter" | "eraser";

/** Mirrors `InkStroke` in apps/desktop/src/types/index.ts field-for-field, same "plugin mirrors the app's real type rather than importing it" boundary every other element-* plugin already follows (CLAUDE.md's "Keep the data model in sync" note). */
export interface InkStrokeData {
  id: string;
  type: "ink";
  points: InkPoint[];
  color: string;
  size: number;
  tool: InkTool;
  zIndex: number;
}

/** One past the highest `zIndex` currently in use — new strokes always paint on top, same convention as every other element type's own `nextZIndex` (segment/file-attachment/youtube-embed). */
export function nextZIndex(strokes: ReadonlyArray<{ zIndex: number }>): number {
  return strokes.reduce((max, item) => Math.max(max, item.zIndex), 0) + 1;
}

const STROKE_OPTIONS = { thinning: 0.6, smoothing: 0.5, streamline: 0.5 };

/**
 * `points` (canvas-space, relative to whatever origin the caller wants —
 * ./InkLayer.tsx passes points already shifted into its `<canvas>`
 * element's own local pixel space) -> an SVG/`Path2D`-compatible path `d`
 * string tracing `perfect-freehand`'s tapered outline polygon. Empty
 * input (a stroke with no points — shouldn't normally happen, but a
 * defensive empty-string return is cheaper than a special case at every
 * call site) yields `""`, which both `new Path2D("")` and an `<path d="">`
 * accept as "nothing to paint."
 */
export function strokeOutlinePath(points: InkPoint[], size: number): string {
  if (points.length === 0) return "";
  const allSamePressure = points.every((p) => p.pressure === points[0].pressure);
  const outline = getStroke(
    points.map((p) => [p.x, p.y, p.pressure]),
    { ...STROKE_OPTIONS, size, simulatePressure: allSamePressure },
  );
  return getSvgPathFromStroke(outline);
}

/**
 * The standard `getSvgPathFromStroke` recipe from perfect-freehand's own
 * README/examples: turns a closed outline polygon into a smooth path by
 * drawing a quadratic Bézier through the midpoint of each pair of
 * consecutive vertices, wrapping back to the first for the closing
 * segment.
 */
function getSvgPathFromStroke(outline: number[][]): string {
  if (outline.length === 0) return "";
  const d = outline.reduce<(string | number)[]>(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...outline[0], "Q"],
  );
  d.push("Z");
  return d.join(" ");
}

/**
 * Bounding rect (canvas-space) of every point across `strokes` and — if a
 * stroke is currently being drawn — `livePoints`, expanded by `padding`
 * plus half the widest stroke's `size` (so a thick stroke's edge is never
 * clipped by the `<canvas>` element's own bounds). `null` if there's
 * nothing to bound yet (no strokes on the page, nothing being drawn).
 */
export function computeStrokesBounds(
  strokes: ReadonlyArray<{ points: InkPoint[]; size: number }>,
  livePoints: InkPoint[] | null,
  padding: number,
): { x: number; y: number; width: number; height: number } | null {
  const allPoints = strokes.flatMap((s) => s.points).concat(livePoints ?? []);
  if (allPoints.length === 0) return null;
  const maxStrokeSize = strokes.reduce((max, s) => Math.max(max, s.size), 0);
  const margin = padding + maxStrokeSize / 2;
  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const minX = Math.min(...xs) - margin;
  const minY = Math.min(...ys) - margin;
  const maxX = Math.max(...xs) + margin;
  const maxY = Math.max(...ys) + margin;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const EPS = 1e-6;

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Shortest distance from `point` to the line segment `a`-`b` (not just to its endpoints) — the standard "project onto the segment, clamp to [0,1]" formula. */
function distanceToSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, a); // a === b — a zero-length segment is just a point
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Per-point "was this point part of a touched segment" flags for
 * `points` — checks distance to each segment *between* consecutive
 * points, not just to the points themselves, so a point falling in the
 * middle of a long gap between two sparse samples (a fast drag, or a
 * robotic/low-sampling-rate input — verified against the real running
 * app via the `run-desktop` skill, which drives pointer input in only a
 * handful of interpolated steps) still counts as touched. A segment
 * within reach marks *both* of its endpoints; a single-point stroke (no
 * segment at all) falls back to a plain point check.
 */
function touchedPointFlags(points: readonly InkPoint[], point: { x: number; y: number }, reach: number): boolean[] {
  const touched = points.map(() => false);
  if (points.length === 1) {
    touched[0] = distance(points[0], point) <= reach + EPS;
    return touched;
  }
  for (let i = 0; i < points.length - 1; i++) {
    if (distanceToSegment(point, points[i], points[i + 1]) <= reach + EPS) {
      touched[i] = true;
      touched[i + 1] = true;
    }
  }
  return touched;
}

/** True if `point` is within eraser reach of any segment of `stroke`'s polyline (see `touchedPointFlags`'s own doc comment for why segment distance, not just point distance). */
export function strokeTouchesPoint(stroke: InkStrokeData, point: { x: number; y: number }, radius: number): boolean {
  const reach = radius + stroke.size / 2;
  return touchedPointFlags(stroke.points, point, reach).some(Boolean);
}

/**
 * One eraser sample against the current working set of strokes (NTA-93).
 * `mode: "whole-stroke"` drops any touched stroke entirely.
 * `mode: "segment"` removes only the touched points, splitting the
 * remainder into separate strokes wherever the removed span was in the
 * middle of the stroke — an untouched stroke keeps its original
 * id/reference unchanged either way, so `computeEraseDiff` below only
 * ever reports strokes that genuinely changed.
 */
export function eraseAtPoint(
  strokes: readonly InkStrokeData[],
  point: { x: number; y: number },
  radius: number,
  mode: "whole-stroke" | "segment",
): InkStrokeData[] {
  if (mode === "whole-stroke") {
    return strokes.filter((stroke) => !strokeTouchesPoint(stroke, point, radius));
  }
  return strokes.flatMap((stroke) => splitStrokeAtPoint(stroke, point, radius));
}

/** A run shorter than this can't form a visible/meaningful stroke on its own and is dropped rather than kept as a near-point sliver. */
const MIN_SPLIT_RUN_LENGTH = 2;

function splitStrokeAtPoint(stroke: InkStrokeData, point: { x: number; y: number }, radius: number): InkStrokeData[] {
  const reach = radius + stroke.size / 2;
  const touched = touchedPointFlags(stroke.points, point, reach);
  if (!touched.some(Boolean)) return [stroke]; // untouched — same reference/id, unchanged

  const runs: InkPoint[][] = [];
  let current: InkPoint[] = [];
  for (let i = 0; i < stroke.points.length; i++) {
    if (touched[i]) {
      if (current.length >= MIN_SPLIT_RUN_LENGTH) runs.push(current);
      current = [];
    } else {
      current.push(stroke.points[i]);
    }
  }
  if (current.length >= MIN_SPLIT_RUN_LENGTH) runs.push(current);

  return runs.map((points) => ({
    id: crypto.randomUUID(),
    type: "ink" as const,
    points,
    color: stroke.color,
    size: stroke.size,
    tool: stroke.tool,
    zIndex: stroke.zIndex,
  }));
}

/**
 * Diffs the working strokes array against what was there before an
 * eraser gesture started — the shape
 * apps/desktop/src/canvas-core/InkLayerHost.tsx needs to build one
 * undoable `Command` covering the whole drag, per NTA-93's "both
 * undoable." Relies on `eraseAtPoint`/`splitStrokeAtPoint` never
 * reassigning an untouched stroke's id, so this only ever reports what
 * actually changed, not the whole array on every sample.
 */
export function computeEraseDiff(
  before: readonly InkStrokeData[],
  after: readonly InkStrokeData[],
): { removedStrokes: InkStrokeData[]; addedStrokes: InkStrokeData[] } {
  const afterIds = new Set(after.map((s) => s.id));
  const beforeIds = new Set(before.map((s) => s.id));
  return {
    removedStrokes: before.filter((s) => !afterIds.has(s.id)),
    addedStrokes: after.filter((s) => !beforeIds.has(s.id)),
  };
}
