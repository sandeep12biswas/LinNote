import { act, useCallback, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InkLayer, type CanvasPoint, type InkLayerProps } from "./InkLayer";
import type { InkStrokeData } from "./ink";

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
  onCommitStroke,
  onEraseStrokes,
  onTogglePanelReady,
}: {
  pointerPosition?: CanvasPoint | null;
  initialStrokes?: InkStrokeData[];
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
    />
  );
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
