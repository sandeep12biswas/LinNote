// InkStroke renderer + tool selection + drawing/erasing gestures
// (NTA-90/91/92/93). Mounted by
// apps/desktop/src/canvas-core/InkLayerHost.tsx as one of
// `CanvasViewport`'s `children`, alongside `SegmentLayer`
// (plugins/element-text-segment) — same direct-import-from-the-app-side
// pattern that file's own header comment already documents (no `render`
// field on `CanvasElementTypeContribution` yet). This component itself
// stays portable — no import from apps/desktop/src/*, same boundary
// every other element-* plugin's own layer component already follows.
//
// Three responsibilities:
//
// 1. NTA-91 — Stroke capture & rendering: while a pen/highlighter tool is
//    active, a primary-button drag anywhere over the canvas (gated on
//    `pointerPosition` being non-null, same "only when actually over the
//    canvas" check plugins/element-text-segment/src/SegmentLayer.tsx's
//    own create-on-type/NTA-38 gestures use) samples `{x, y, pressure, t}`
//    points via window-scoped pointermove listeners — the same
//    window-scoped pattern as that file's NTA-38/39 gestures, for the
//    same reason: this component's own root element has no reliable
//    full-viewport size to hang pointer capture off, so `screenToCanvas`/
//    `pointerPosition` (host-supplied) are the only coordinate source
//    needed. `./ink.ts`'s `strokeOutlinePath` turns the sampled points
//    into a `perfect-freehand` tapered outline, painted as a `Path2D` on
//    one `<canvas>` element sized to the bounding box of every stroke on
//    the page (`./ink.ts`'s `computeStrokesBounds`) — not yet tiled
//    per-viewport-region the way docs/architecture.md §5 eventually
//    wants (that's NTA-73/74's own job; this is "the single-canvas,
//    functionally-complete first version those later optimize," per
//    NTA-90's own text). `pointerup` commits the finished stroke via
//    `onCommitStroke`. `touch-action: none` is already set on
//    `.canvas-viewport` itself (apps/desktop/src/App.css, NTA-33) — that
//    already covers this gesture too, verified by inspection since jsdom
//    can't simulate a real touch/pen contact's native-scroll behavior
//    either way (same category of "can't verify in this test environment"
//    as that file's own auto-grow-height note).
//
// 2. NTA-92 — Tool selection: a toolbar/menu command
//    (`TOGGLE_INK_PANEL_COMMAND`, installed for real by
//    `InkLayerHost.tsx` the same "arm via a ref callback" way NTA-38's
//    `onCreateVisibleSegmentReady` already works) toggles a small floating
//    control panel — pen/highlighter/eraser buttons, a color + size
//    control per drawing tool, and a whole-stroke/segment mode toggle for
//    the eraser. Rendered via `createPortal` to `document.body`, same fix
//    plugins/element-youtube-embed/src/YouTubeEmbedLayer.tsx's own insert
//    dialog already needed (NTA-64) — a `position: fixed` element nested
//    inside `CanvasViewport`'s pan/zoom-transformed layer is contained by
//    that transform, per the CSS spec, not actually fixed to the
//    viewport; a portal escapes it. Selecting a tool is *sticky* (stays
//    active across multiple strokes, not a one-shot arm-then-disarm like
//    NTA-38's segment creation) — left to this ticket's own judgment
//    ("one-shot (or sticky, TBD at implementation time)"), since a
//    drawing tool that requires reselecting itself after every stroke
//    would be unusable for anything but a single mark.
//
// 3. NTA-93 — Eraser: `./ink.ts`'s `eraseAtPoint` runs once per pointerdown
//    and again on every pointermove sample during an eraser drag, against
//    a *working* copy of the page's strokes (starting from a snapshot
//    taken at pointerdown) — not the real store, so nothing commits until
//    pointerup. `whole-stroke` mode drops any stroke the eraser touches;
//    `segment` mode removes only the touched points, splitting the
//    remainder into separate strokes when the touched span was in the
//    middle. `pointerup` diffs the final working set against the
//    pre-drag snapshot (`./ink.ts`'s `computeEraseDiff`) and hands both to
//    `onEraseStrokes` — `InkLayerHost.tsx` is what turns that into one
//    undoable `Command` covering the whole drag, per the ticket's "both
//    undoable."

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  computeStrokesBounds,
  eraseAtPoint,
  nextZIndex,
  strokeOutlinePath,
  type InkPoint,
  type InkStrokeData,
  type InkTool,
} from "./ink";

export const TOGGLE_INK_PANEL_COMMAND = "core.element.ink.toggle-panel";

const DEFAULT_PEN_COLOR = "#1a1a1a";
const DEFAULT_PEN_SIZE = 4;
const DEFAULT_HIGHLIGHTER_COLOR = "#ffe066";
const DEFAULT_HIGHLIGHTER_SIZE = 18;
/** Highlighter strokes paint at reduced opacity so overlapping marks (and whatever's underneath) stay visible, the same "translucent marker" look every highlighter tool has. */
const HIGHLIGHTER_ALPHA = 0.4;
const DEFAULT_ERASER_RADIUS = 14;
/** Extra margin (beyond half the widest stroke's own size) around the bounding `<canvas>` — see `./ink.ts`'s `computeStrokesBounds` doc comment. */
const BOUNDS_PADDING = 24;

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface InkLayerProps {
  /** Every `ink` element on the open page. */
  strokes: InkStrokeData[];
  /** Called once a pen/highlighter stroke is released, with the finished stroke (not yet on the page). */
  onCommitStroke: (stroke: InkStrokeData) => void;
  /** Called once an eraser drag is released, with the strokes as they were before the drag and as they ended up after — a no-op call (`before === after`, by reference-equal contents) if the drag never actually touched anything. */
  onEraseStrokes: (before: InkStrokeData[], after: InkStrokeData[]) => void;
  /** The pointer's last known canvas-space position — see canvas-core's `useCanvasCoordinates()`. `null` gates every gesture below off (same convention as SegmentLayer's create-on-type/NTA-38 gestures) so a stray pointerdown elsewhere in the app never starts a stroke. */
  pointerPosition: CanvasPoint | null;
  /** Converts a pointer event's `clientX`/`clientY` (screen space) into canvas-space — see canvas-core's `useCanvasCoordinates()`. */
  screenToCanvas: (clientX: number, clientY: number) => CanvasPoint;
  /** Suppresses CanvasViewport's own pan-drag while a stroke/erase gesture owns the drag — see canvas-core's `useCanvasCoordinates()` doc comment. */
  setPanSuppressed?: (suppressed: boolean) => void;
  /** Called once with a stable `togglePanel` function the host can invoke (e.g. from `TOGGLE_INK_PANEL_COMMAND`'s handler) to show/hide the tool panel — mirrors `SegmentLayerProps.onCreateVisibleSegmentReady`'s doc comment. */
  onTogglePanelReady?: (togglePanel: () => void) => void;
}

export function InkLayer({
  strokes,
  onCommitStroke,
  onEraseStrokes,
  pointerPosition,
  screenToCanvas,
  setPanSuppressed,
  onTogglePanelReady,
}: InkLayerProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<InkTool | null>(null);
  const [penColor, setPenColor] = useState(DEFAULT_PEN_COLOR);
  const [penSize, setPenSize] = useState(DEFAULT_PEN_SIZE);
  const [highlighterColor, setHighlighterColor] = useState(DEFAULT_HIGHLIGHTER_COLOR);
  const [highlighterSize, setHighlighterSize] = useState(DEFAULT_HIGHLIGHTER_SIZE);
  const [eraserMode, setEraserMode] = useState<"whole-stroke" | "segment">("whole-stroke");
  /** The in-progress pen/highlighter stroke's points, for a live preview before it's committed — `null` when nothing is being drawn. */
  const [livePoints, setLivePoints] = useState<InkPoint[] | null>(null);
  /** The in-progress eraser drag's live working set — overrides `strokes` for rendering while non-null. */
  const [workingStrokes, setWorkingStrokes] = useState<InkStrokeData[] | null>(null);

  // Refs mirror the rest of this workspace's "always read the latest
  // prop/state from inside a window-scoped listener registered once"
  // convention (SegmentLayer.tsx's own header comment, point 4).
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const penColorRef = useRef(penColor);
  penColorRef.current = penColor;
  const penSizeRef = useRef(penSize);
  penSizeRef.current = penSize;
  const highlighterColorRef = useRef(highlighterColor);
  highlighterColorRef.current = highlighterColor;
  const highlighterSizeRef = useRef(highlighterSize);
  highlighterSizeRef.current = highlighterSize;
  const eraserModeRef = useRef(eraserMode);
  eraserModeRef.current = eraserMode;
  const pointerPositionRef = useRef(pointerPosition);
  pointerPositionRef.current = pointerPosition;
  const screenToCanvasRef = useRef(screenToCanvas);
  screenToCanvasRef.current = screenToCanvas;
  const setPanSuppressedRef = useRef(setPanSuppressed);
  setPanSuppressedRef.current = setPanSuppressed;
  const onCommitStrokeRef = useRef(onCommitStroke);
  onCommitStrokeRef.current = onCommitStroke;
  const onEraseStrokesRef = useRef(onEraseStrokes);
  onEraseStrokesRef.current = onEraseStrokes;

  const panelRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<{ points: InkPoint[] } | null>(null);
  /** `working` is mutated in place as pointermove samples arrive and read directly at pointerup — a ref, not React state, so pointerup always sees the latest value regardless of which render's closure it runs in (the same problem `setPanSuppressed`'s own doc comment already flags for cross-component event ordering). `setWorkingStrokes` alongside it is purely for the live preview render. */
  const eraseSessionRef = useRef<{ before: InkStrokeData[]; working: InkStrokeData[] } | null>(null);

  useEffect(() => {
    onTogglePanelReady?.(() => setPanelOpen((open) => !open));
  }, [onTogglePanelReady]);

  // Pointer capture — window-scoped, same reasoning as SegmentLayer.tsx's
  // NTA-38 drag-to-draw gesture (see this file's header comment, point 1).
  //
  // Pan is suppressed for the *entire* armed window (set as soon as this
  // effect runs, released on cleanup), not just once a stroke/erase drag
  // is detected — same fix, same reasoning, as
  // plugins/element-text-segment/src/SegmentLayer.tsx's own NTA-38 drag-
  // to-draw gesture already needed: CanvasViewport's own pointerdown
  // handler (a React synthetic listener on its root container) fires
  // *before* this window-level one for the same physical event (the
  // container sits below `window` on the bubble path), so suppressing
  // only inside `handlePointerDown` below would always be one event too
  // late to stop that first press from also starting a pan — found by
  // actually driving the app end-to-end (a drag that should have stayed
  // in place instead visibly panned the canvas underneath it, and a
  // later erase click missed a stroke whose points had been recorded
  // against a viewport origin that kept shifting mid-drag).
  useEffect(() => {
    if (!activeTool) return;
    setPanSuppressedRef.current?.(true);
    return () => setPanSuppressedRef.current?.(false);
  }, [activeTool]);

  useEffect(() => {
    if (!activeTool) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return; // clicking the tool panel itself never starts a stroke/erase
      const point = pointerPositionRef.current;
      if (!point) return; // off-canvas

      if (activeToolRef.current === "eraser") {
        const before = strokesRef.current;
        const working = eraseAtPoint(before, point, DEFAULT_ERASER_RADIUS, eraserModeRef.current);
        eraseSessionRef.current = { before, working };
        setWorkingStrokes(working);
      } else {
        const first: InkPoint = { x: point.x, y: point.y, pressure: event.pressure || 0.5, t: performance.now() };
        drawingRef.current = { points: [first] };
        setLivePoints([first]);
      }
    }

    function handlePointerMove(event: PointerEvent) {
      const point = screenToCanvasRef.current(event.clientX, event.clientY);

      if (activeToolRef.current === "eraser") {
        const session = eraseSessionRef.current;
        if (!session) return;
        session.working = eraseAtPoint(session.working, point, DEFAULT_ERASER_RADIUS, eraserModeRef.current);
        setWorkingStrokes(session.working);
        return;
      }

      const drawing = drawingRef.current;
      if (!drawing) return;
      const next: InkPoint = { x: point.x, y: point.y, pressure: event.pressure || 0.5, t: performance.now() };
      drawing.points.push(next);
      setLivePoints([...drawing.points]);
    }

    function handlePointerUp() {
      const session = eraseSessionRef.current;
      if (session) {
        eraseSessionRef.current = null;
        setWorkingStrokes(null);
        onEraseStrokesRef.current(session.before, session.working);
        return;
      }

      const drawing = drawingRef.current;
      drawingRef.current = null;
      setLivePoints(null);
      if (!drawing || drawing.points.length === 0) return;
      const tool = activeToolRef.current as "pen" | "highlighter";
      const stroke: InkStrokeData = {
        id: crypto.randomUUID(),
        type: "ink",
        points: drawing.points,
        color: tool === "highlighter" ? highlighterColorRef.current : penColorRef.current,
        size: tool === "highlighter" ? highlighterSizeRef.current : penSizeRef.current,
        tool,
        zIndex: nextZIndex(strokesRef.current),
      };
      onCommitStrokeRef.current(stroke);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeTool]);

  const displayedStrokes = workingStrokes ?? strokes;
  const bounds = useMemo(
    () => computeStrokesBounds(displayedStrokes, livePoints, BOUNDS_PADDING),
    [displayedStrokes, livePoints],
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bounds) return;
    const ctx = canvas.getContext("2d");
    // No real 2D context available — this workspace's jsdom test
    // environment included (no `canvas` npm package installed; see
    // SegmentLayer.tsx's own auto-grow-height note for the same category
    // of "can't verify actual pixels in this test environment" limit).
    // Everything above this guard (bounds math, event wiring, outline
    // math, eraser math, command commit) is what's actually tested.
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of displayedStrokes) {
      const localPoints = stroke.points.map((p) => ({ ...p, x: p.x - bounds.x, y: p.y - bounds.y }));
      const path = new Path2D(strokeOutlinePath(localPoints, stroke.size));
      ctx.globalAlpha = stroke.tool === "highlighter" ? HIGHLIGHTER_ALPHA : 1;
      ctx.fillStyle = stroke.color;
      ctx.fill(path);
    }
    if (livePoints && livePoints.length > 0 && activeTool !== "eraser") {
      const localPoints = livePoints.map((p) => ({ ...p, x: p.x - bounds.x, y: p.y - bounds.y }));
      const size = activeTool === "highlighter" ? highlighterSizeRef.current : penSizeRef.current;
      const color = activeTool === "highlighter" ? highlighterColorRef.current : penColorRef.current;
      const path = new Path2D(strokeOutlinePath(localPoints, size));
      ctx.globalAlpha = activeTool === "highlighter" ? HIGHLIGHTER_ALPHA : 1;
      ctx.fillStyle = color;
      ctx.fill(path);
    }
    ctx.globalAlpha = 1;
  }, [displayedStrokes, livePoints, bounds, activeTool]);

  function selectTool(tool: InkTool) {
    setActiveTool(tool);
  }

  function handleDone() {
    setActiveTool(null);
    setPanelOpen(false);
  }

  return (
    <div className="ink-layer">
      {bounds && (
        <canvas
          ref={canvasRef}
          className="ink-layer__canvas"
          style={{ left: bounds.x, top: bounds.y }}
          width={Math.ceil(bounds.width)}
          height={Math.ceil(bounds.height)}
        />
      )}
      {panelOpen &&
        createPortal(
          <div
            ref={panelRef}
            className="ink-tool-panel"
            // Stop a pointerdown/pointerup on the panel's own controls from bubbling to CanvasViewport (which would otherwise start a pan) — same reasoning as SegmentBlockView's own handlePointerDown.
            onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => event.stopPropagation()}
          >
            <div className="ink-tool-panel__tools">
              <button
                type="button"
                className={activeTool === "pen" ? "ink-tool-panel__tool is-active" : "ink-tool-panel__tool"}
                onClick={() => selectTool("pen")}
              >
                Pen
              </button>
              <button
                type="button"
                className={activeTool === "highlighter" ? "ink-tool-panel__tool is-active" : "ink-tool-panel__tool"}
                onClick={() => selectTool("highlighter")}
              >
                Highlighter
              </button>
              <button
                type="button"
                className={activeTool === "eraser" ? "ink-tool-panel__tool is-active" : "ink-tool-panel__tool"}
                onClick={() => selectTool("eraser")}
              >
                Eraser
              </button>
            </div>
            {activeTool === "pen" && (
              <div className="ink-tool-panel__options">
                <label>
                  Color <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} />
                </label>
                <label>
                  Size{" "}
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={penSize}
                    onChange={(e) => setPenSize(Number(e.target.value))}
                  />
                </label>
              </div>
            )}
            {activeTool === "highlighter" && (
              <div className="ink-tool-panel__options">
                <label>
                  Color{" "}
                  <input type="color" value={highlighterColor} onChange={(e) => setHighlighterColor(e.target.value)} />
                </label>
                <label>
                  Size{" "}
                  <input
                    type="range"
                    min={8}
                    max={40}
                    value={highlighterSize}
                    onChange={(e) => setHighlighterSize(Number(e.target.value))}
                  />
                </label>
              </div>
            )}
            {activeTool === "eraser" && (
              <div className="ink-tool-panel__options">
                <label>
                  <input
                    type="radio"
                    name="ink-eraser-mode"
                    value="whole-stroke"
                    checked={eraserMode === "whole-stroke"}
                    onChange={() => setEraserMode("whole-stroke")}
                  />
                  Whole stroke
                </label>
                <label>
                  <input
                    type="radio"
                    name="ink-eraser-mode"
                    value="segment"
                    checked={eraserMode === "segment"}
                    onChange={() => setEraserMode("segment")}
                  />
                  Pixel/segment
                </label>
              </div>
            )}
            <button type="button" className="ink-tool-panel__done" onClick={handleDone}>
              Done
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
