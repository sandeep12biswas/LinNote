import { describe, expect, it } from "vitest";
import {
  computeEraseDiff,
  computeStrokesBounds,
  eraseAtPoint,
  nextZIndex,
  strokeOutlinePath,
  strokeTouchesPoint,
  type InkPoint,
  type InkStrokeData,
} from "./ink";

function makeStroke(overrides: Partial<InkStrokeData> = {}): InkStrokeData {
  return {
    id: "stroke-1",
    type: "ink",
    points: [
      { x: 0, y: 0, pressure: 0.5, t: 0 },
      { x: 10, y: 0, pressure: 0.5, t: 10 },
      { x: 20, y: 0, pressure: 0.5, t: 20 },
      { x: 30, y: 0, pressure: 0.5, t: 30 },
      { x: 40, y: 0, pressure: 0.5, t: 40 },
    ],
    color: "#1a1a1a",
    size: 4,
    tool: "pen",
    zIndex: 0,
    ...overrides,
  };
}

describe("nextZIndex", () => {
  it("is 1 for an empty list (same convention as every other element type's own nextZIndex)", () => {
    expect(nextZIndex([])).toBe(1);
  });

  it("is one past the highest existing zIndex", () => {
    expect(nextZIndex([{ zIndex: 2 }, { zIndex: 5 }, { zIndex: 1 }])).toBe(6);
  });
});

describe("strokeOutlinePath", () => {
  it("returns an empty string for no points", () => {
    expect(strokeOutlinePath([], 4)).toBe("");
  });

  it("returns a well-formed SVG path (M ... Q ... Z) for a real stroke", () => {
    const points: InkPoint[] = [
      { x: 0, y: 0, pressure: 0.5, t: 0 },
      { x: 10, y: 5, pressure: 0.6, t: 10 },
      { x: 20, y: 0, pressure: 0.5, t: 20 },
    ];
    const path = strokeOutlinePath(points, 4);
    expect(path.startsWith("M ")).toBe(true);
    expect(path).toContain(" Q ");
    expect(path.endsWith(" Z")).toBe(true);
  });

  it("produces a wider outline for a larger size", () => {
    const points: InkPoint[] = [
      { x: 0, y: 0, pressure: 0.5, t: 0 },
      { x: 20, y: 0, pressure: 0.5, t: 20 },
    ];
    const narrow = strokeOutlinePath(points, 2);
    const wide = strokeOutlinePath(points, 20);
    // Crude but effective: a much thicker stroke's outline extends further from the centerline, so its numeric coordinates span a wider range.
    const extractNumbers = (path: string) => path.split(" ").map(Number).filter((n) => !Number.isNaN(n));
    const spread = (path: string) => {
      const numbers = extractNumbers(path);
      return Math.max(...numbers) - Math.min(...numbers);
    };
    expect(spread(wide)).toBeGreaterThan(spread(narrow));
  });
});

describe("computeStrokesBounds", () => {
  it("is null when there are no strokes and nothing is being drawn", () => {
    expect(computeStrokesBounds([], null, 10)).toBeNull();
  });

  it("bounds a single stroke's points, expanded by padding + half its size", () => {
    const bounds = computeStrokesBounds([{ points: [{ x: 0, y: 0, pressure: 0.5, t: 0 }, { x: 100, y: 50, pressure: 0.5, t: 1 }], size: 10 }], null, 20);
    // margin = padding(20) + size/2(5) = 25
    expect(bounds).toEqual({ x: -25, y: -25, width: 150, height: 100 });
  });

  it("includes livePoints (an in-progress stroke) in the bounds", () => {
    const bounds = computeStrokesBounds([], [{ x: 5, y: 5, pressure: 0.5, t: 0 }], 10);
    expect(bounds).toEqual({ x: -5, y: -5, width: 20, height: 20 });
  });
});

describe("strokeTouchesPoint", () => {
  it("is true when point is within reach of one of the stroke's points", () => {
    expect(strokeTouchesPoint(makeStroke(), { x: 10, y: 3 }, 10)).toBe(true);
  });

  it("is false when point is far from every one of the stroke's points", () => {
    expect(strokeTouchesPoint(makeStroke(), { x: 1000, y: 1000 }, 10)).toBe(false);
  });

  it("is true for a point that falls between two sparse samples — not close to either endpoint individually, but close to the segment connecting them (found by actually driving the app: a fast/low-sample-rate drag leaves gaps a point-only check would miss)", () => {
    const sparse: InkStrokeData = makeStroke({
      points: [
        { x: 0, y: 0, pressure: 0.5, t: 0 },
        { x: 100, y: 0, pressure: 0.5, t: 1 }, // 100 units from the first — far wider than any reasonable radius
      ],
    });
    // (50, 0) is exactly on the segment's midpoint — over 40 units from either endpoint, well outside a radius of 10, but distance-to-segment is 0.
    expect(strokeTouchesPoint(sparse, { x: 50, y: 0 }, 10)).toBe(true);
  });
});

describe("eraseAtPoint", () => {
  it("whole-stroke mode removes an entire touched stroke", () => {
    const strokes = [makeStroke({ id: "a" }), makeStroke({ id: "b", points: [{ x: 500, y: 500, pressure: 0.5, t: 0 }] })];
    const result = eraseAtPoint(strokes, { x: 10, y: 0 }, 5, "whole-stroke");
    expect(result.map((s) => s.id)).toEqual(["b"]);
  });

  it("whole-stroke mode leaves an untouched stroke's reference unchanged", () => {
    const untouched = makeStroke({ id: "untouched", points: [{ x: 500, y: 500, pressure: 0.5, t: 0 }] });
    const result = eraseAtPoint([untouched], { x: 0, y: 0 }, 5, "whole-stroke");
    expect(result[0]).toBe(untouched);
  });

  // 7 points spaced 20 apart (x = 0..120), rather than the default
  // `makeStroke`'s 10-apart spacing — segment-distance touch-marking
  // (below) marks *both* endpoints of any segment the eraser point is
  // close to, so with the default tight spacing a single erase click
  // consumes 3+ consecutive points at once, leaving only single-point
  // (degenerate, dropped) remnants on each side instead of a clean
  // 2-piece split. Wider spacing keeps enough surviving points on each
  // side to actually demonstrate a split.
  function makeWideStroke(overrides: Partial<InkStrokeData> = {}): InkStrokeData {
    return makeStroke({
      points: Array.from({ length: 7 }, (_, i) => ({ x: i * 20, y: 0, pressure: 0.5, t: i })),
      ...overrides,
    });
  }

  it("segment mode splits a stroke touched in the middle into two strokes", () => {
    const stroke = makeWideStroke(); // points at x = 0,20,40,60,80,100,120
    const result = eraseAtPoint([stroke], { x: 60, y: 0 }, 3, "segment");
    expect(result).toHaveLength(2);
    expect(result[0].points.map((p) => p.x)).toEqual([0, 20]);
    expect(result[1].points.map((p) => p.x)).toEqual([100, 120]);
    // Split pieces are fresh strokes, not the original.
    expect(result[0].id).not.toBe(stroke.id);
    expect(result[1].id).not.toBe(stroke.id);
    expect(result[0].id).not.toBe(result[1].id);
  });

  it("segment mode erasing an end leaves one shorter stroke", () => {
    const stroke = makeStroke(); // x = 0,10,20,30,40
    const result = eraseAtPoint([stroke], { x: 0, y: 0 }, 3, "segment");
    expect(result).toHaveLength(1);
    // Touches the x=0..10 segment (both endpoints — see makeWideStroke's own doc comment on why segment-distance touch-marking consumes a neighbor too), leaving x=20,30,40.
    expect(result[0].points.map((p) => p.x)).toEqual([20, 30, 40]);
  });

  it("segment mode erasing the whole stroke removes it entirely", () => {
    const stroke = makeStroke();
    const result = eraseAtPoint([stroke], { x: 20, y: 0 }, 100, "segment"); // radius covers every point
    expect(result).toHaveLength(0);
  });

  it("segment mode drops a remaining run shorter than 2 points as degenerate", () => {
    const stroke = makeStroke(); // x = 0,10,20,30,40
    const result = eraseAtPoint([stroke], { x: 30, y: 0 }, 3, "segment");
    // Touches both the x=20..30 and x=30..40 segments, consuming x=20,30,40; left run [0,10] survives (length 2).
    expect(result).toHaveLength(1);
    expect(result[0].points.map((p) => p.x)).toEqual([0, 10]);
  });

  it("segment mode leaves an untouched stroke's reference unchanged", () => {
    const untouched = makeStroke({ id: "untouched", points: [{ x: 500, y: 500, pressure: 0.5, t: 0 }] });
    const result = eraseAtPoint([untouched], { x: 0, y: 0 }, 3, "segment");
    expect(result[0]).toBe(untouched);
  });
});

describe("computeEraseDiff", () => {
  it("reports no changes when before and after are identical", () => {
    const strokes = [makeStroke()];
    expect(computeEraseDiff(strokes, strokes)).toEqual({ removedStrokes: [], addedStrokes: [] });
  });

  it("reports a fully-removed stroke", () => {
    const stroke = makeStroke();
    const { removedStrokes, addedStrokes } = computeEraseDiff([stroke], []);
    expect(removedStrokes).toEqual([stroke]);
    expect(addedStrokes).toEqual([]);
  });

  it("reports removed + added strokes for a mid-stroke split", () => {
    // Wide spacing (see eraseAtPoint's own makeWideStroke doc comment) so
    // the erase leaves two real surviving pieces, not two degenerate
    // single-point remnants.
    const original: InkStrokeData = {
      id: "orig",
      type: "ink",
      points: Array.from({ length: 7 }, (_, i) => ({ x: i * 20, y: 0, pressure: 0.5, t: i })),
      color: "#1a1a1a",
      size: 4,
      tool: "pen",
      zIndex: 0,
    };
    const before = [original];
    const after = eraseAtPoint(before, { x: 60, y: 0 }, 3, "segment");
    const { removedStrokes, addedStrokes } = computeEraseDiff(before, after);
    expect(removedStrokes.map((s) => s.id)).toEqual(["orig"]);
    expect(addedStrokes).toHaveLength(2);
  });
});
