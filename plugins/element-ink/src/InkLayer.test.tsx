import { act, useCallback, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InkLayer, type CanvasPoint, type InkLayerProps } from "./InkLayer";
import type { InkRect, InkStrokeData } from "./ink";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

function mount(children: ReactNode): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(children));
}

/** Same "canvas-space === screen-space, 1:1, no pan" simplification as plugins/element-text-segment/src/SegmentLayer.test.tsx's own identityScreenToCanvas. */
function identityScreenToCanvas(clientX: number, clientY: number): CanvasPoint {
  return { x: clientX, y: clientY };
}

function dispatchPointer(type: "pointerdown" | "pointermove" | "pointerup", clientX: number, clientY: number): void {
  act(() => {
    window.dispatchEvent(
      new PointerEvent(type, { button: 0, pointerId: 1, clientX, clientY, bubbles: true, pressure: 0.5 }),
    );
  });
}

/**
 * A minimal controlled host, standing in for
 * ../../apps/desktop/src/canvas-core/InkLayerHost.tsx: owns `strokes`
 * state and feeds InkLayer's callbacks back into it, the same pattern
 * plugins/element-text-segment/src/SegmentLayer.test.tsx's own `Harness`
 * already uses. Also exposes the `togglePanel`/commit spies a test needs.
 */
function Harness({
  pointerPosition = { x: 0, y: 0 },
  initialStrokes = [],
  visibleRect,
  onCommitStroke,
  onEraseStrokes,
  onTogglePanelReady,
}: {
  pointerPosition?: CanvasPoint | null;
  initialStrokes?: InkStrokeData[];
  visibleRect?: InkRect | null;
  onCommitStroke?: InkLayerProps["onCommitStroke"];
  onEraseStrokes?: InkLayerProps["onEraseStrokes"];
  onTogglePanelReady?: InkLayerProps["onTogglePanelReady"];
}) {
  const [strokes, setStrokes] = useState<InkStrokeData[]>(initialStrokes);

  const handleCommit = useCallback(
    (stroke: InkStrokeData) => {
      setStrokes((current) => [...current, stroke]);
      onCommitStroke?.(stroke);
    },
    [onCommitStroke],
  );

  const handleErase = useCallback(
    (before: InkStrokeData[], after: InkStrokeData[]) => {
      setStrokes(after);
      onEraseStrokes?.(before, after);
    },
    [onEraseStrokes],
  );

  return (
    <InkLayer
      strokes={strokes}
      onCommitStroke={handleCommit}
      onEraseStrokes={handleErase}
      pointerPosition={pointerPosition}
      screenToCanvas={identityScreenToCanvas}
      onTogglePanelReady={onTogglePanelReady}
      visibleRect={visibleRect}
    />
  );
}

/** Every currently-mounted tile/overlay `<canvas>`'s own `left`/`top` inline style, as numbers — enough to tell tiles apart without a real 2D context (see this file's existing "can't verify actual pixels" notes elsewhere). */
function canvasPositions(): Array<{ left: number; top: number }> {
  return Array.from(document.querySelectorAll<HTMLCanvasElement>(".ink-layer__canvas")).map((canvas) => ({
    left: Number.parseFloat(canvas.style.left),
    top: Number.parseFloat(canvas.style.top),
  }));
}

function findButton(text: string): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];
  const match = buttons.find((button) => button.textContent === text);
  if (!match) throw new Error(`no <button> with text "${text}"`);
  return match;
}

describe("InkLayer: tool panel (NTA-92)", () => {
  it("renders no panel until onTogglePanelReady's togglePanel is invoked", () => {
    mount(<Harness />);
    expect(document.querySelector(".ink-tool-panel")).toBeNull();
  });

  it("togglePanel (the host's arm trigger) shows, then hides, the panel", () => {
    let togglePanel: (() => void) | null = null;
    mount(<Harness onTogglePanelReady={(fn) => (togglePanel = fn)} />);

    act(() => togglePanel!());
    expect(document.querySelector(".ink-tool-panel")).not.toBeNull();

    act(() => togglePanel!());
    expect(document.querySelector(".ink-tool-panel")).toBeNull();
  });

  it("clicking Done hides the panel and deactivates the tool", () => {
    let togglePanel: (() => void) | null = null;
    const onCommitStroke = vi.fn();
    mount(<Harness onTogglePanelReady={(fn) => (togglePanel = fn)} onCommitStroke={onCommitStroke} />);
    act(() => togglePanel!());
    act(() => findButton("Pen").click());

    act(() => findButton("Done").click());
    expect(document.querySelector(".ink-tool-panel")).toBeNull();

    // Drawing no longer does anything once deactivated.
    dispatchPointer("pointerdown", 0, 0);
    dispatchPointer("pointermove", 10, 10);
    dispatchPointer("pointerup", 10, 10);
    expect(onCommitStroke).not.toHaveBeenCalled();
  });
});

describe("InkLayer: stroke capture (NTA-91)", () => {
  it("dragging with the pen tool active commits a pen stroke with the sampled points", () => {
    let togglePanel: (() => void) | null = null;
    const onCommitStroke = vi.fn();
    mount(<Harness onTogglePanelReady={(fn) => (togglePanel = fn)} onCommitStroke={onCommitStroke} />);
    act(() => togglePanel!());
    act(() => findButton("Pen").click());

    dispatchPointer("pointerdown", 0, 0);
    dispatchPointer("pointermove", 10, 0);
    dispatchPointer("pointermove", 20, 0);
    dispatchPointer("pointerup", 20, 0);

    expect(onCommitStroke).toHaveBeenCalledTimes(1);
    const stroke = onCommitStroke.mock.calls[0][0] as InkStrokeData;
    expect(stroke.tool).toBe("pen");
    expect(stroke.points.map((p) => ({ x: p.x, y: p.y }))).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    expect(stroke.color).toBe("#1a1a1a"); // default pen color
  });

  it("dragging with the highlighter tool active commits a highlighter stroke with highlighter defaults", () => {
    let togglePanel: (() => void) | null = null;
    const onCommitStroke = vi.fn();
    mount(<Harness onTogglePanelReady={(fn) => (togglePanel = fn)} onCommitStroke={onCommitStroke} />);
    act(() => togglePanel!());
    act(() => findButton("Highlighter").click());

    dispatchPointer("pointerdown", 5, 5);
    dispatchPointer("pointermove", 15, 5);
    dispatchPointer("pointerup", 15, 5);

    expect(onCommitStroke).toHaveBeenCalledTimes(1);
    const stroke = onCommitStroke.mock.calls[0][0] as InkStrokeData;
    expect(stroke.tool).toBe("highlighter");
    expect(stroke.color).toBe("#ffe066"); // default highlighter color
    expect(stroke.size).toBe(18); // default highlighter size
  });

  it("does nothing when the pointer isn't over the canvas (pointerPosition is null)", () => {
    let togglePanel: (() => void) | null = null;
    const onCommitStroke = vi.fn();
    mount(
      <Harness pointerPosition={null} onTogglePanelReady={(fn) => (togglePanel = fn)} onCommitStroke={onCommitStroke} />,
    );
    act(() => togglePanel!());
    act(() => findButton("Pen").click());

    dispatchPointer("pointerdown", 0, 0);
    dispatchPointer("pointermove", 10, 10);
    dispatchPointer("pointerup", 10, 10);

    expect(onCommitStroke).not.toHaveBeenCalled();
  });

  it("clicking a tool-panel control does not itself start a stroke", () => {
    let togglePanel: (() => void) | null = null;
    const onCommitStroke = vi.fn();
    mount(<Harness onTogglePanelReady={(fn) => (togglePanel = fn)} onCommitStroke={onCommitStroke} />);
    act(() => togglePanel!());

    act(() => findButton("Pen").click()); // a real pointerdown+click on a panel button

    expect(onCommitStroke).not.toHaveBeenCalled();
  });
});

function makeStroke(overrides: Partial<InkStrokeData> = {}): InkStrokeData {
  return {
    id: "existing-stroke",
    type: "ink",
    points: [
      { x: 0, y: 0, pressure: 0.5, t: 0 },
      { x: 10, y: 0, pressure: 0.5, t: 1 },
      { x: 20, y: 0, pressure: 0.5, t: 2 },
      { x: 30, y: 0, pressure: 0.5, t: 3 },
    ],
    color: "#1a1a1a",
    size: 4,
    tool: "pen",
    zIndex: 1,
    ...overrides,
  };
}

/**
 * A pointerdown reads `pointerPosition` (the host-supplied "is the
 * pointer over the canvas, and where" prop — see InkLayer.tsx's own
 * header comment, point 1), not the dispatched event's own
 * clientX/clientY — same gating convention SegmentLayer.test.tsx's own
 * tests already follow for NTA-38's create-on-click/-drag gestures. So
 * these eraser tests control where an erase *starts* via the Harness's
 * `pointerPosition` prop, and only use `dispatchPointer`'s clientX/clientY
 * for what happens *after* (there's no pointermove in these single-tap
 * tests, so it isn't exercised here).
 */
function selectEraserMode(mode: "whole-stroke" | "segment"): void {
  const input = document.querySelector(`input[name="ink-eraser-mode"][value="${mode}"]`) as HTMLInputElement;
  if (!input) throw new Error(`no eraser-mode radio for "${mode}"`);
  act(() => input.click());
}

describe("InkLayer: eraser (NTA-93)", () => {
  it("whole-stroke mode (the default) removes an entire stroke the eraser touches", () => {
    let togglePanel: (() => void) | null = null;
    const onEraseStrokes = vi.fn();
    const existing = makeStroke();
    mount(
      <Harness
        pointerPosition={{ x: 10, y: 0 }} // right on the stroke's second point
        onTogglePanelReady={(fn) => (togglePanel = fn)}
        initialStrokes={[existing]}
        onEraseStrokes={onEraseStrokes}
      />,
    );
    act(() => togglePanel!());
    act(() => findButton("Eraser").click());

    dispatchPointer("pointerdown", 10, 0);
    dispatchPointer("pointerup", 10, 0);

    expect(onEraseStrokes).toHaveBeenCalledTimes(1);
    const [before, after] = onEraseStrokes.mock.calls[0] as [InkStrokeData[], InkStrokeData[]];
    expect(before).toEqual([existing]);
    expect(after).toEqual([]);
  });

  it("segment mode splits a stroke touched in the middle into two surviving strokes", () => {
    let togglePanel: (() => void) | null = null;
    const onEraseStrokes = vi.fn();
    // Nine points spaced 20 apart (x = 0..160) so the eraser's reach
    // (radius 14 + size/2 2 = 16) only sweeps the segments touching the
    // middle point (60/80/100), leaving a run of 3 on each side — long
    // enough to survive as its own stroke. Segment-distance touch-marking
    // (./ink.ts's `touchedPointFlags`) marks *both* endpoints of any
    // segment within reach, so tighter spacing than this would consume
    // more than one point on each side of the erase point, same reasoning
    // as ink.test.ts's own `makeWideStroke` comment.
    const existing = makeStroke({
      points: Array.from({ length: 9 }, (_, i) => ({ x: i * 20, y: 0, pressure: 0.5, t: i })),
    });
    mount(
      <Harness
        pointerPosition={{ x: 80, y: 0 }} // the stroke's true middle point
        onTogglePanelReady={(fn) => (togglePanel = fn)}
        initialStrokes={[existing]}
        onEraseStrokes={onEraseStrokes}
      />,
    );
    act(() => togglePanel!());
    act(() => findButton("Eraser").click());
    selectEraserMode("segment");

    dispatchPointer("pointerdown", 80, 0);
    dispatchPointer("pointerup", 80, 0);

    expect(onEraseStrokes).toHaveBeenCalledTimes(1);
    const [, after] = onEraseStrokes.mock.calls[0] as [InkStrokeData[], InkStrokeData[]];
    expect(after).toHaveLength(2); // split into a left piece and a right piece
    expect(after[0].points.map((p) => p.x)).toEqual([0, 20, 40]);
    expect(after[1].points.map((p) => p.x)).toEqual([120, 140, 160]);
  });

  it("dragging the eraser without touching any stroke calls onEraseStrokes with before === after", () => {
    let togglePanel: (() => void) | null = null;
    const onEraseStrokes = vi.fn();
    const existing = makeStroke();
    mount(
      <Harness
        pointerPosition={{ x: 9999, y: 9999 }} // nowhere near the existing stroke
        onTogglePanelReady={(fn) => (togglePanel = fn)}
        initialStrokes={[existing]}
        onEraseStrokes={onEraseStrokes}
      />,
    );
    act(() => togglePanel!());
    act(() => findButton("Eraser").click());

    dispatchPointer("pointerdown", 9999, 9999);
    dispatchPointer("pointerup", 9999, 9999);

    expect(onEraseStrokes).toHaveBeenCalledTimes(1);
    const [before, after] = onEraseStrokes.mock.calls[0] as [InkStrokeData[], InkStrokeData[]];
    expect(after).toEqual(before);
  });
});

describe("InkLayer: tiling & static/active layer split (NTA-73/74)", () => {
  it("with no visibleRect (viewport not measured yet), falls back to one tile covering every stroke's own bounds", () => {
    // Placed well clear of x=0/y=0 (unlike makeStroke's default 0..30) so
    // the stroke's own padded bounds don't straddle the tile grid's
    // origin — keeps this a clean single-tile case; the multi-tile
    // straddle case is exactly what the next test exercises instead.
    const stroke = makeStroke({ points: [{ x: 200, y: 200, pressure: 0.5, t: 0 }, { x: 230, y: 200, pressure: 0.5, t: 1 }] });
    mount(<Harness initialStrokes={[stroke]} />);
    expect(canvasPositions()).toEqual([{ left: 0, top: 0 }]); // fallback bounds fit inside tile (0,0)
  });

  it("with no visibleRect, a stroke whose padded bounds straddle the grid origin gets a tile on every side it touches", () => {
    // makeStroke's default points (x = 0..30, size 4) pad out to x ∈
    // [-26, 56] — negative on one side, so the fixed 1024-unit grid
    // (anchored at multiples of 1024, not at the stroke's own bounds)
    // gives it a tile on both sides of x=0 (and, since y is 0 too, both
    // sides of y=0): four tiles, not one — this is the grid being fixed
    // rather than content-fitted, working as designed.
    mount(<Harness initialStrokes={[makeStroke()]} />);
    const positions = canvasPositions().sort((a, b) => a.left - b.left || a.top - b.top);
    expect(positions).toEqual(
      [
        { left: -1024, top: -1024 },
        { left: -1024, top: 0 },
        { left: 0, top: -1024 },
        { left: 0, top: 0 },
      ].sort((a, b) => a.left - b.left || a.top - b.top),
    );
  });

  it("only mounts tiles intersecting visibleRect (a stroke far outside it isn't painted at all)", () => {
    const near = makeStroke({ id: "near" }); // x = 0..30, inside tile (0,0)
    const far = makeStroke({ id: "far", points: [{ x: 5000, y: 5000, pressure: 0.5, t: 0 }] }); // several tiles away
    mount(
      <Harness
        initialStrokes={[near, far]}
        visibleRect={{ x: 0, y: 0, width: 100, height: 100 }} // near the origin only
      />,
    );
    // Only tile (0,0) (and whatever neighbors the overscan margin pulls in
    // around the origin) mount — none of them at the far stroke's tile.
    const positions = canvasPositions();
    expect(positions.length).toBeGreaterThan(0);
    expect(positions).not.toContainEqual({ left: 4096, top: 4096 }); // far's tile (tx=4, ty=4 at INK_TILE_SIZE=1024)
  });

  it("renders an overlay canvas for the in-progress stroke, in addition to any tile canvases, while drawing", () => {
    let togglePanel: (() => void) | null = null;
    // Drawn well clear of x=0/y=0 (see the previous test's own note on
    // why) so the committed stroke ends up in exactly one tile, keeping
    // this test's before/after counts simple.
    mount(<Harness pointerPosition={{ x: 200, y: 200 }} onTogglePanelReady={(fn) => (togglePanel = fn)} />);
    act(() => togglePanel!());
    act(() => findButton("Pen").click());

    expect(document.querySelectorAll(".ink-layer__canvas")).toHaveLength(0); // nothing committed, nothing being drawn yet

    dispatchPointer("pointerdown", 200, 200);
    dispatchPointer("pointermove", 210, 200);
    expect(document.querySelectorAll(".ink-layer__canvas")).toHaveLength(1); // the live overlay only — still nothing committed

    dispatchPointer("pointerup", 210, 200);
    expect(document.querySelectorAll(".ink-layer__canvas")).toHaveLength(1); // the overlay is gone; the newly-committed stroke's tile takes its place
  });

  it("does not remount a tile's canvas element while drawing an unrelated in-progress stroke (the static layer stays untouched)", () => {
    let togglePanel: (() => void) | null = null;
    mount(<Harness initialStrokes={[makeStroke()]} onTogglePanelReady={(fn) => (togglePanel = fn)} />);
    const tileCanvasBefore = document.querySelector(".ink-layer__canvas");
    expect(tileCanvasBefore).not.toBeNull();

    act(() => togglePanel!());
    act(() => findButton("Pen").click());
    dispatchPointer("pointerdown", 500, 500);
    dispatchPointer("pointermove", 510, 500);

    // Same tile <canvas> DOM node — React never remounted it, so its
    // committed-stroke paint effect never re-ran either (NTA-74).
    const tileCanvasAfter = document.querySelector(".ink-layer__canvas");
    expect(tileCanvasAfter).toBe(tileCanvasBefore);
  });
});
