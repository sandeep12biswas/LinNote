// The render surface half of NTA-33 — mounts into ../shell/AppShell.tsx's
// Editor Canvas pane (`app-shell__pane--editor-canvas`). Wires pointer-drag
// pan and wheel zoom to the pure `panViewport`/`zoomViewport` math in
// ./index.ts, applies the resulting `{ x, y, scale }` as a CSS
// `transform` on an inner layer, and renders the open page's background
// from `useNotePageStore` (./index.ts).
//
// Public extension points, for the next wave of tickets to mount into
// (see this file's own `CanvasViewportProps` doc comments below):
//   - `header` — rendered *outside* the pan/zoom transform, e.g. NTA-34's
//     page header (title/date/alignment): it should stay a fixed size on
//     screen regardless of zoom level.
//   - `children` — rendered *inside* the transformed layer, e.g.
//     NTA-37+'s segment blocks and other `CanvasElement` renderers: they
//     should scale/pan together with the page content.
//
// NTA-37 populates `children` for the first time (segment blocks, via
// ../canvas-core/SegmentLayerHost.tsx mounted from ../shell/AppShell.tsx)
// and needs to convert a pointer event's screen position into canvas-space
// coordinates — e.g. to place a newly-typed segment "where the cursor is".
// `CanvasCoordinatesContext`/`useCanvasCoordinates()` below expose exactly
// that (plus the pointer's live canvas-space position) to anything mounted
// as `children`, without changing the `children: ReactNode` contract
// itself or requiring a second render-prop-shaped API.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { NotePage } from "../types";
import { useCanvasCommandStore } from "./commandStack";
import { DEFAULT_VIEWPORT, panViewport, useNotePageStore, zoomViewport, type Viewport } from "./index";

export interface CanvasViewportProps {
  /** id of the currently open page (a `page`-type `WorkspaceNode.id`). Drives which `NotePage` is loaded/synthesized and resets the viewport on change. */
  pageId: string;
  /** Rendered above/outside the pan/zoom transform — fixed on screen regardless of `scale`. Reserved for NTA-34's page header. */
  header?: ReactNode;
  /** Rendered inside the pan/zoom-transformed layer, alongside the page's own content — pans/scales together with it. Reserved for NTA-37+'s segment blocks and other `CanvasElement` renderers. */
  children?: ReactNode;
}

/** A point in canvas-space — the same coordinate space `SegmentBlock.x`/`y` (../types) are stored in. */
export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasCoordinates {
  /** Converts a pointer event's `clientX`/`clientY` (screen space) into canvas-space, undoing the current pan/zoom transform. */
  screenToCanvas: (clientX: number, clientY: number) => CanvasPoint;
  /**
   * The pointer's last known position over the canvas surface, already
   * converted to canvas-space — `null` once the pointer has left it. Lets
   * a `children` consumer (e.g. NTA-37's create-on-type gesture) know
   * "where the user is looking" without its own window-wide pointermove
   * listener; updated on every pointermove regardless of whether a pan
   * drag is in progress. Cheap enough at today's scale — Phase 9/NTA-75
   * (RAF batching) is the place to revisit this if it ever shows up as a
   * bottleneck.
   */
  pointerPosition: CanvasPoint | null;
  /**
   * Temporarily suppresses this viewport's own pointer-drag pan gesture
   * — for a `children` consumer that wants exclusive use of a primary-
   * button drag for something else (e.g. NTA-38's drag-to-draw a new
   * segment) without a competing pan starting underneath it. Callers
   * MUST pair `setPanSuppressed(true)` with a later
   * `setPanSuppressed(false)` (on pointerup/cancel/unmount) — nothing
   * else clears it automatically.
   */
  setPanSuppressed: (suppressed: boolean) => void;
}

const CanvasCoordinatesContext = createContext<CanvasCoordinates>({
  screenToCanvas: (x, y) => ({ x, y }),
  pointerPosition: null,
  setPanSuppressed: () => {},
});

/** Read by anything mounted as `CanvasViewport`'s `children` — see this file's header comment. */
export function useCanvasCoordinates(): CanvasCoordinates {
  return useContext(CanvasCoordinatesContext);
}

/** Wheel-delta-to-zoom-factor sensitivity — tuned so a normal mouse-wheel notch feels like a small, controllable zoom step, not a jump. */
const ZOOM_SENSITIVITY = 0.0015;

export function CanvasViewport({ pageId, header, children }: CanvasViewportProps) {
  const notePage = useNotePageStore((state) => state.pages[pageId]);
  const ensurePage = useNotePageStore((state) => state.ensurePage);

  // Get-or-create is a store *action* (it may call `set`), so it runs as
  // an effect rather than during render — see ./index.ts's `ensurePage`
  // doc comment. `notePage` above re-selects once this has run, so a
  // never-before-opened page id renders its blank/synthesized page one
  // tick after mount rather than on the first render.
  useEffect(() => {
    ensurePage(pageId);
  }, [ensurePage, pageId]);

  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);

  // One Viewport per open page, reset (not persisted) on every page
  // switch — see ./index.ts's header comment for why: nothing tracks a
  // per-page pan/zoom position yet.
  useEffect(() => {
    setViewport(DEFAULT_VIEWPORT);
  }, [pageId]);

  // NTA-66: the canvas command stack is also one-per-open-page — reset
  // it here too, alongside the viewport, rather than in some third place,
  // since this is already the "runs once per pageId change" effect every
  // other per-page reset in this file lives in. A stack left over from
  // the previous open page would let Ctrl+Z on this one undo edits that
  // belong to a different page entirely.
  useEffect(() => {
    useCanvasCommandStore.getState().resetForPage(pageId);
  }, [pageId]);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  // Screen -> canvas-space conversion for the *current* viewport. The
  // render surface applies `translate(x, y) scale(scale)` with
  // `transform-origin: 0 0` (../App.css), so a point's screen position is
  // `surfaceOrigin + viewport.xy + canvasPoint * viewport.scale`; solving
  // for `canvasPoint` gives the inverse below. Recomputed (cheaply — no
  // DOM measurement beyond one `getBoundingClientRect()`) whenever
  // `viewport` changes, exposed to `children` via context rather than
  // baked into a single one-off calculation, since a create-on-type
  // gesture needs it live as the user pans/zooms with the pointer still.
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number): CanvasPoint => {
      const bounds = surfaceRef.current?.getBoundingClientRect();
      const originX = (bounds?.left ?? 0) + viewport.x;
      const originY = (bounds?.top ?? 0) + viewport.y;
      return { x: (clientX - originX) / viewport.scale, y: (clientY - originY) / viewport.scale };
    },
    [viewport],
  );

  const [pointerPosition, setPointerPosition] = useState<CanvasPoint | null>(null);
  const panSuppressedRef = useRef(false);
  const setPanSuppressed = useCallback((suppressed: boolean) => {
    panSuppressedRef.current = suppressed;
  }, []);

  const coordinates = useMemo<CanvasCoordinates>(
    () => ({ screenToCanvas, pointerPosition, setPanSuppressed }),
    [screenToCanvas, pointerPosition, setPanSuppressed],
  );

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Primary button/contact only (mouse left-click, single touch/pen point).
    if (event.button !== 0) return;
    if (panSuppressedRef.current) return; // a `children` consumer owns this drag instead — see `setPanSuppressed`'s doc comment
    dragState.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    // Tracked unconditionally (not just while panning) — this is the one
    // place a screen pointermove over the whole surface is already
    // observed, so `children` (via useCanvasCoordinates()) get it for
    // free instead of adding their own window-wide listener.
    setPointerPosition(screenToCanvas(event.clientX, event.clientY));

    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    setViewport((current) => panViewport(current, dx, dy));
  }

  function handlePointerLeave() {
    setPointerPosition(null);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragState.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const pointerX = bounds ? event.clientX - bounds.left : 0;
    const pointerY = bounds ? event.clientY - bounds.top : 0;
    // Trackpad pinch-to-zoom arrives as a `wheel` event with `ctrlKey`
    // set (the standard browser convention for both real Ctrl+wheel and
    // a pinch gesture) — same rescale-around-pointer math either way, so
    // it isn't distinguished further here, per the ticket's "pinch if
    // easy — don't block on it" note.
    const factor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY);
    setViewport((current) => zoomViewport(current, pointerX, pointerY, factor));
  }

  return (
    <div
      ref={surfaceRef}
      className="canvas-viewport"
      style={notePage ? backgroundStyle(notePage.background) : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={handlePointerLeave}
      onWheel={handleWheel}
    >
      {header}
      <div
        className="canvas-viewport__transform"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
      >
        <CanvasCoordinatesContext.Provider value={coordinates}>{children}</CanvasCoordinatesContext.Provider>
      </div>
    </div>
  );
}

/**
 * Maps a `NotePage.background` (../types#NotePage) to inline CSS. Only
 * the color/pattern *rendering* is this ticket's concern — the picker UI
 * and real per-pattern styling polish are NTA-35's; `plain`/no pattern
 * both fall back to a flat color fill.
 */
function backgroundStyle(background: NotePage["background"]): CSSProperties {
  const color = background.color ?? "#ffffff";
  if (background.kind !== "pattern" || !background.pattern || background.pattern === "plain") {
    return { backgroundColor: color };
  }

  // TODO(NTA-35): these are a minimal, functional rendering of each
  // pattern — the real picker/styling pass owns refining line weight,
  // spacing, and color beyond "visibly a ruled/grid/dotted page".
  switch (background.pattern) {
    case "ruled":
      return {
        backgroundColor: color,
        backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 27px, rgba(0,0,0,0.12) 27px 28px)",
      };
    case "grid":
      return {
        backgroundColor: color,
        backgroundImage:
          "repeating-linear-gradient(to bottom, transparent 0 27px, rgba(0,0,0,0.1) 27px 28px)," +
          "repeating-linear-gradient(to right, transparent 0 27px, rgba(0,0,0,0.1) 27px 28px)",
      };
    case "dotted":
      return {
        backgroundColor: color,
        backgroundImage: "radial-gradient(rgba(0,0,0,0.25) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
      };
    default:
      return { backgroundColor: color };
  }
}
