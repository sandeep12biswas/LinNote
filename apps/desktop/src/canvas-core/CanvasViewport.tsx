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
// Neither slot is populated yet — this ticket is purely the coordinate-
// space plumbing (docs/architecture.md §5) other editor subtasks build on.

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { NotePage } from "../types";
import { DEFAULT_VIEWPORT, panViewport, useNotePageStore, zoomViewport, type Viewport } from "./index";

export interface CanvasViewportProps {
  /** id of the currently open page (a `page`-type `WorkspaceNode.id`). Drives which `NotePage` is loaded/synthesized and resets the viewport on change. */
  pageId: string;
  /** Rendered above/outside the pan/zoom transform — fixed on screen regardless of `scale`. Reserved for NTA-34's page header. */
  header?: ReactNode;
  /** Rendered inside the pan/zoom-transformed layer, alongside the page's own content — pans/scales together with it. Reserved for NTA-37+'s segment blocks and other `CanvasElement` renderers. */
  children?: ReactNode;
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

  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Primary button/contact only (mouse left-click, single touch/pen point).
    if (event.button !== 0) return;
    dragState.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    setViewport((current) => panViewport(current, dx, dy));
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
      onWheel={handleWheel}
    >
      {header}
      <div
        className="canvas-viewport__transform"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
      >
        {children}
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
