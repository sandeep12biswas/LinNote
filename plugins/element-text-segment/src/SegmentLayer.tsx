// SegmentBlock renderer + the "invisible create-on-type" gesture (NTA-37,
// Desing architecture §7). Mounted by
// apps/desktop/src/canvas-core/SegmentLayerHost.tsx as `CanvasViewport`'s
// `children` (apps/desktop/src/canvas-core/CanvasViewport.tsx reserves
// that slot for exactly this) — a direct import from the app side, not
// yet routed through the generic `canvasElementTypes` contribution
// (`@linnote/plugin-sdk`'s `CanvasElementTypeContribution` has no
// `render` field yet; that's a later-phase TODO once a second element
// type needs the same per-type dispatch). This component itself stays
// portable — it only depends on `@linnote/plugin-sdk`-adjacent shared
// packages (`@linnote/rich-text-engine`), never on `apps/desktop/src/*`,
// so it can still boot standalone via `../playground.tsx` /
// `@linnote/plugin-playground`.
//
// `SegmentBlockData` below deliberately mirrors `SegmentBlock` in
// apps/desktop/src/types/index.ts field-for-field rather than importing
// it (a plugin importing an app-internal module would be the reverse of
// this repo's intended dependency direction — apps/desktop depends on
// plugins, never the other way around); the host narrows the app's real
// `SegmentBlock[]` down to this shape at the boundary. Keep both in sync
// if the shape changes — see CLAUDE.md's "Keep the data model in sync"
// note.
//
// Four responsibilities:
// 1. Render every existing segment via @linnote/rich-text-engine's
//    RichTextEngineProvider + EditorContent — border invisible by
//    default (`visibility: "invisible"`), revealed on hover/focus via
//    CSS (apps/desktop/src/App.css's `.segment-block` rules); a
//    `visibility: "visible"` segment (below) reuses the same renderer
//    with its border always shown.
// 2. The invisible create-on-type gesture (NTA-37): on the first
//    printable keystroke with nothing else focused and no existing
//    segment under the pointer's last-known canvas-space position,
//    create a new (empty) segment there, focus it, and feed it that
//    keystroke.
// 3. The deliberate visible-creation gesture (NTA-38): a host-triggered
//    "arm" (wired to a toolbar/menu command by
//    apps/desktop/src/canvas-core/SegmentLayerHost.tsx, via
//    `onCreateVisibleSegmentReady` below) puts this component into a
//    one-shot "draw" state; the *next* primary-button click or drag
//    anywhere creates a visible segment — a plain click at the default
//    size, a drag sized/positioned to the dragged rectangle. Escape
//    cancels an armed-but-not-yet-dragging gesture. Tracked via window
//    `pointerdown`/`pointerup` listeners (mirroring the keydown
//    listener's own window-scoped pattern) rather than a DOM hit-target
//    of this component's own, since `.segment-layer` (nested inside
//    CanvasViewport's scaled/panned transform layer) has no reliable
//    full-viewport size to hang pointer capture off; `pointerPosition`
//    (host-supplied, canvas-space, continuously updated while the
//    pointer is over the canvas) is the only coordinate source needed.
//    `setPanSuppressed` (also host-supplied) stops CanvasViewport's own
//    pan-drag from starting underneath this gesture's drag.
// 4. Drag/reposition an existing segment (NTA-39): grabbing a segment's
//    border/padding — not its text content, distinguished via
//    `event.target === event.currentTarget` in `SegmentBlockView` below
//    — starts a drag that updates its `x`/`y` live via `onMoveSegment`.
//    Tracked the same window-scoped way as the other gestures, but
//    computes canvas-space coordinates via the host-supplied
//    `screenToCanvas` on every raw pointermove rather than reading the
//    `pointerPosition` prop: that prop is updated by *another*
//    component's (CanvasViewport's) React state for the very same
//    pointermove event, and a same-event read of it here would have the
//    same cross-component event-ordering risk `setPanSuppressed`'s own
//    comment (NTA-38) already ran into — computing directly from the
//    raw event sidesteps it entirely, matching how CanvasViewport's own
//    pan-drag works. `key={segment.id}` below never changes across a
//    move, and the position update only ever spreads `{...segment, x,
//    y}` (leaving `content`'s object reference untouched) — so
//    `RichTextEngineProvider`/TipTap never sees a changed `content` prop
//    and never remounts/resets during a drag, satisfying the ticket's
//    "byte-identical content, no flicker" requirement structurally
//    rather than needing special-case code for it.
// 5. Auto-grow height + manual-resize width, with reflow (NTA-40):
//    height already grows visually for free — `SegmentBlockView` sets
//    CSS `minHeight`, never `height`, so ordinary block layout grows the
//    box downward as content wraps to more lines, never sideways.
//    What's missing before this ticket is the *stored* `segment.height`
//    ever reflecting that — it stayed frozen at whatever it was created
//    with, which understated `isPointInsideSegment`'s hit-test box for
//    any segment that had grown since. `useAutoGrowHeight` below fixes
//    that with a `ResizeObserver` on each segment's own wrapper,
//    reporting real measured height back through `onHeightChange`
//    whenever it changes. Width resize is genuinely new: a thin
//    `.segment-block__resize-handle` strip on each side starts a resize
//    gesture, tracked the same window-scoped, `screenToCanvas`-driven
//    way as NTA-39's drag (merged into the very same effect — the two
//    are mutually exclusive, so one shared `pointermove`/`pointerup`
//    pair covers both). Dragging the right handle changes only `width`;
//    the left handle changes `width` *and* `x` together so the
//    segment's *right* edge stays fixed while its left edge follows the
//    pointer. Reflow needs no extra code: `width` is already applied as
//    an inline style, so the browser (and TipTap's own text wrapping
//    inside it) reflows automatically the moment it changes.
//
// jsdom (this workspace's test environment) doesn't implement
// `ResizeObserver` and can't perform real CSS layout regardless, so
// `SegmentLayer.test.tsx`'s auto-grow-height coverage can only verify
// the *wiring* (mount → observe → onHeightChange when fired) against a
// test-only polyfill, not real rendered measurements — the actual
// "never needs manual resize" visual behavior is a CSS fact (no
// `height` in the inline style, only `minHeight`), verified by
// inspection rather than a rendering test. Width-resize, by contrast,
// is pure coordinate math like NTA-39's drag and is fully testable.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  EditorContent,
  RichTextEngineProvider,
  useRichTextEditor,
  type RichTextDoc,
} from "@linnote/rich-text-engine";

/** The command id NTA-38's toolbar/menu "Add Segment" entry runs — shared between this plugin's own manifest/activate() and apps/desktop/src/canvas-core/SegmentLayerHost.tsx's real, page-aware registration of it. */
export const CREATE_VISIBLE_SEGMENT_COMMAND = "core.element.text-segment.createVisible";

/** Below this, in canvas-space units, a drag-to-draw gesture is treated as a plain click (default-sized create) rather than a deliberately-sized rectangle. */
const DRAG_THRESHOLD = 4;

/** A point in canvas-space — same coordinate space `SegmentBlockData.x`/`y` are stored in. */
export interface CanvasPoint {
  x: number;
  y: number;
}

/** Mirrors `SegmentBlock` (apps/desktop/src/types/index.ts) — see this file's header comment. */
export interface SegmentBlockData {
  id: string;
  type: "segment";
  visibility: "invisible" | "visible";
  x: number;
  y: number;
  width: number;
  height: number;
  content: RichTextDoc | undefined;
  zIndex: number;
}

/** A segment's default size for a brand-new, empty create-on-type block. */
export const DEFAULT_SEGMENT_WIDTH = 240;
// Overwritten almost immediately by `useAutoGrowHeight`'s first real
// measurement once the segment mounts — this is just what a
// freshly-created segment's `height` starts as before that happens.
export const DEFAULT_SEGMENT_HEIGHT = 32;

/** Width resize (NTA-40) never shrinks a segment below this — must match `.segment-block`'s own CSS `min-width` (apps/desktop/src/App.css); the two can't share a single source of truth across a TS/CSS boundary, so keep them in sync by hand. */
export const MIN_SEGMENT_WIDTH = 40;

/** True if `point` (canvas-space) falls within `segment`'s bounding box. */
export function isPointInsideSegment(point: CanvasPoint, segment: SegmentBlockData): boolean {
  return (
    point.x >= segment.x &&
    point.x <= segment.x + segment.width &&
    point.y >= segment.y &&
    point.y <= segment.y + segment.height
  );
}

/** One more than the highest `zIndex` among `segments` (0 if there are none) — keeps a newly-created segment stacked above every existing one. */
export function nextZIndex(segments: SegmentBlockData[]): number {
  if (segments.length === 0) return 0;
  return segments.reduce((max, segment) => Math.max(max, segment.zIndex), 0) + 1;
}

/**
 * True if a global keydown should be treated as "the user wants to start
 * typing into the canvas" rather than into whatever's already focused
 * (a rename field, the search box, an already-focused segment's own
 * editor — TipTap/ProseMirror focuses a real DOM node, so this check
 * covers it too) — a single printable character with no modifier held,
 * and nothing else currently focused.
 */
function isCreateOnTypeKey(event: KeyboardEvent): boolean {
  if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false;
  const active = document.activeElement;
  return active === null || active === document.body;
}

export interface SegmentLayerProps {
  /** Every `segment` element on the open page. */
  segments: SegmentBlockData[];
  /** The pointer's last known canvas-space position (see canvas-core's `useCanvasCoordinates()`) — `null` when it isn't over the canvas. Drives both creation gestures' placement. */
  pointerPosition: CanvasPoint | null;
  /** Called to commit a brand-new segment (already carrying the just-typed first character, once its own editor mounts) onto the page. */
  onCreateSegment: (segment: SegmentBlockData) => void;
  /** Called whenever an existing segment's rich-text content changes. */
  onSegmentContentChange: (id: string, content: RichTextDoc) => void;
  /** Called with an existing segment's new `x`/`y` (canvas-space) as it's dragged — see NTA-39 in this file's header comment. */
  onMoveSegment: (id: string, x: number, y: number) => void;
  /** Called with a segment's newly-measured rendered height whenever it changes — see NTA-40 (auto-grow height) in this file's header comment. */
  onHeightChange: (id: string, height: number) => void;
  /** Called with an existing segment's new `x`/`width` (canvas-space) as it's resized from a side handle — see NTA-40 in this file's header comment. `x` changes alongside `width` for a left-edge resize (keeping the right edge fixed); for a right-edge resize `x` is unchanged. */
  onResizeSegment: (id: string, x: number, width: number) => void;
  /** Converts a pointer event's `clientX`/`clientY` (screen space) into canvas-space — see canvas-core's `useCanvasCoordinates()`. NTA-39's drag gesture needs this (not just `pointerPosition`) for the reason its own header-comment section explains. */
  screenToCanvas: (clientX: number, clientY: number) => CanvasPoint;
  /**
   * Called once with a stable `armCreateVisible` function the host can
   * invoke (e.g. from a toolbar/menu command's handler,
   * NTA-38's `CREATE_VISIBLE_SEGMENT_COMMAND`) to arm this component's
   * deliberate visible-creation gesture — this component stays the one
   * place that knows how to build/place/focus a segment; the host only
   * needs a handle to ask for one.
   */
  onCreateVisibleSegmentReady?: (armCreateVisible: () => void) => void;
  /** Suppresses CanvasViewport's own pan-drag while the drag-to-draw gesture owns a primary-button drag — see canvas-core's `useCanvasCoordinates()` doc comment. Omitted (e.g. in a test harness) just means drag-to-draw and panning can visually fight; the create-on-click/-drag logic itself doesn't depend on it. */
  setPanSuppressed?: (suppressed: boolean) => void;
}

export function SegmentLayer({
  segments,
  pointerPosition,
  onCreateSegment,
  onSegmentContentChange,
  onMoveSegment,
  onHeightChange,
  onResizeSegment,
  screenToCanvas,
  onCreateVisibleSegmentReady,
  setPanSuppressed,
}: SegmentLayerProps) {
  // Refs mirroring the latest props/state: the window-level listeners
  // below are attached with minimal deps rather than re-attached on
  // every pointermove/render, so they always see the latest
  // segments/pointer/callbacks without thrashing the listener.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const pointerPositionRef = useRef(pointerPosition);
  pointerPositionRef.current = pointerPosition;
  const onCreateSegmentRef = useRef(onCreateSegment);
  onCreateSegmentRef.current = onCreateSegment;
  const onMoveSegmentRef = useRef(onMoveSegment);
  onMoveSegmentRef.current = onMoveSegment;
  const onResizeSegmentRef = useRef(onResizeSegment);
  onResizeSegmentRef.current = onResizeSegment;
  const screenToCanvasRef = useRef(screenToCanvas);
  screenToCanvasRef.current = screenToCanvas;
  const setPanSuppressedRef = useRef(setPanSuppressed);
  setPanSuppressedRef.current = setPanSuppressed;

  const [pendingFocus, setPendingFocus] = useState<{ id: string; firstChar?: string } | null>(null);
  const [drawArmed, setDrawArmed] = useState(false);
  const drawArmedRef = useRef(drawArmed);
  drawArmedRef.current = drawArmed;
  const dragStartRef = useRef<CanvasPoint | null>(null);

  /** Builds, commits, and queues autofocus for a new segment at `point` — the one place both creation gestures below construct a `SegmentBlockData`. */
  function createSegmentAt(
    point: CanvasPoint,
    options: { visibility: SegmentBlockData["visibility"]; firstChar?: string; width?: number; height?: number },
  ) {
    const currentSegments = segmentsRef.current;
    const segment: SegmentBlockData = {
      id: `segment-${crypto.randomUUID()}`,
      type: "segment",
      visibility: options.visibility,
      x: point.x,
      y: point.y,
      width: options.width ?? DEFAULT_SEGMENT_WIDTH,
      height: options.height ?? DEFAULT_SEGMENT_HEIGHT,
      content: undefined,
      zIndex: nextZIndex(currentSegments),
    };
    onCreateSegmentRef.current(segment);
    setPendingFocus({ id: segment.id, firstChar: options.firstChar });
  }

  // Invisible create-on-type (NTA-37) + Escape/ignore handling while a
  // visible-creation gesture is armed (NTA-38) — one window-level
  // keydown listener, attached once.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (drawArmedRef.current) {
        if (event.key === "Escape") setDrawArmed(false);
        return; // ignore all other keys while a create-visible gesture is armed, so it can't also trigger create-on-type
      }

      if (!isCreateOnTypeKey(event)) return;

      const point = pointerPositionRef.current;
      if (!point) return; // pointer isn't over the canvas at all

      const currentSegments = segmentsRef.current;
      if (currentSegments.some((segment) => isPointInsideSegment(point, segment))) return; // NTA-37 is empty-space-only; an existing segment under the cursor is left alone

      event.preventDefault();
      createSegmentAt(point, { visibility: "invisible", firstChar: event.key });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Exposes the "arm" trigger to the host once — see `onCreateVisibleSegmentReady`'s doc comment above.
  useEffect(() => {
    onCreateVisibleSegmentReady?.(() => setDrawArmed(true));
  }, [onCreateVisibleSegmentReady]);

  // Deliberate visible creation (NTA-38): while armed, the next
  // pointerdown starts (or, for a plain click, immediately is) the
  // gesture; pointerup finalizes it — click-sized if the drag never
  // moved past DRAG_THRESHOLD, else sized/positioned to the dragged
  // rectangle. Window-scoped rather than a DOM hit-target of this
  // component's own — see this file's header comment for why.
  //
  // Pan is suppressed for the *entire* armed window (set as soon as this
  // effect runs, released on cleanup), not just once a drag is
  // detected: CanvasViewport's own pointerdown handler (a React
  // synthetic listener on its root container) fires *before* this
  // window-level one for the same physical event (the container sits
  // below `window` on the bubble path) — suppressing only inside
  // `handlePointerDown` below would always be one event too late to stop
  // that first press from also starting a pan.
  useEffect(() => {
    if (!drawArmed) return;
    setPanSuppressedRef.current?.(true);

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const point = pointerPositionRef.current;
      if (!point) {
        // Primary-button press somewhere off the canvas entirely (another
        // pane, the menu bar, ...) — read as "changed their mind", not a
        // draw start; let it do whatever it would normally do elsewhere.
        setDrawArmed(false);
        return;
      }
      dragStartRef.current = point;
    }

    function handlePointerUp() {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      setDrawArmed(false);
      if (!start) return; // armed, but the pointerdown above bailed out (off-canvas) — nothing to finalize

      const end = pointerPositionRef.current ?? start;
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);
      if (width < DRAG_THRESHOLD || height < DRAG_THRESHOLD) {
        createSegmentAt(start, { visibility: "visible" }); // plain click (or a negligible drag): default size at the click point
      } else {
        const origin = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) };
        createSegmentAt(origin, { visibility: "visible", width, height });
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      setPanSuppressedRef.current?.(false);
    };
  }, [drawArmed]);

  // Drag/reposition an existing segment (NTA-39) — see this file's
  // header comment for the full design. `draggingRef` (not state) since
  // nothing here needs a re-render on drag start/end, only on each
  // `onMoveSegment` call the host's own segments prop update already
  // drives.
  const draggingRef = useRef<{ id: string; startCanvas: CanvasPoint; startX: number; startY: number } | null>(null);

  function handleDragHandleDown(segmentId: string, clientX: number, clientY: number) {
    const segment = segmentsRef.current.find((candidate) => candidate.id === segmentId);
    if (!segment) return;
    draggingRef.current = {
      id: segmentId,
      startCanvas: screenToCanvasRef.current(clientX, clientY),
      startX: segment.x,
      startY: segment.y,
    };
    setPanSuppressedRef.current?.(true);
  }

  // Manual-resize width (NTA-40) — mutually exclusive with `draggingRef`
  // above (a pointerdown starts at most one of the two), so they share
  // the one `pointermove`/`pointerup` pair below rather than each
  // registering their own window listeners.
  const resizingRef = useRef<{
    id: string;
    edge: "left" | "right";
    startCanvasX: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  function handleResizeHandleDown(segmentId: string, edge: "left" | "right", clientX: number) {
    const segment = segmentsRef.current.find((candidate) => candidate.id === segmentId);
    if (!segment) return;
    resizingRef.current = {
      id: segmentId,
      edge,
      startCanvasX: screenToCanvasRef.current(clientX, 0).x,
      startX: segment.x,
      startWidth: segment.width,
    };
    setPanSuppressedRef.current?.(true);
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragging = draggingRef.current;
      if (dragging) {
        const point = screenToCanvasRef.current(event.clientX, event.clientY);
        onMoveSegmentRef.current(
          dragging.id,
          dragging.startX + (point.x - dragging.startCanvas.x),
          dragging.startY + (point.y - dragging.startCanvas.y),
        );
        return;
      }

      const resizing = resizingRef.current;
      if (resizing) {
        const dx = screenToCanvasRef.current(event.clientX, 0).x - resizing.startCanvasX;
        if (resizing.edge === "right") {
          const width = Math.max(MIN_SEGMENT_WIDTH, resizing.startWidth + dx);
          onResizeSegmentRef.current(resizing.id, resizing.startX, width);
        } else {
          // Left edge: width shrinks as it moves right (positive dx), and
          // x is *derived* from the new width so that x + width — the
          // right edge — stays exactly fixed, clamped or not.
          const width = Math.max(MIN_SEGMENT_WIDTH, resizing.startWidth - dx);
          const x = resizing.startX + (resizing.startWidth - width);
          onResizeSegmentRef.current(resizing.id, x, width);
        }
      }
    }

    function handlePointerUp() {
      if (!draggingRef.current && !resizingRef.current) return;
      draggingRef.current = null;
      resizingRef.current = null;
      setPanSuppressedRef.current?.(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  return (
    <div className="segment-layer">
      {segments.map((segment) => (
        <SegmentBlockView
          key={segment.id}
          segment={segment}
          autoFocus={pendingFocus?.id === segment.id}
          firstChar={pendingFocus?.id === segment.id ? pendingFocus.firstChar : undefined}
          onAutoFocusHandled={() => setPendingFocus(null)}
          onContentChange={onSegmentContentChange}
          onDragHandleDown={handleDragHandleDown}
          onHeightChange={onHeightChange}
          onResizeHandleDown={handleResizeHandleDown}
        />
      ))}
    </div>
  );
}

interface SegmentBlockViewProps {
  segment: SegmentBlockData;
  autoFocus: boolean;
  firstChar: string | undefined;
  onAutoFocusHandled: () => void;
  onContentChange: (id: string, content: RichTextDoc) => void;
  /** Grabbing the border/padding (not the text content) starts a drag (NTA-39) — see the `handlePointerDown` below and this file's header comment. */
  onDragHandleDown: (segmentId: string, clientX: number, clientY: number) => void;
  /** The segment's real rendered height, whenever `useAutoGrowHeight` observes it changing (NTA-40). */
  onHeightChange: (id: string, height: number) => void;
  /** Grabbing a side resize handle starts a width resize (NTA-40). */
  onResizeHandleDown: (segmentId: string, edge: "left" | "right", clientX: number) => void;
}

function SegmentBlockView({
  segment,
  autoFocus,
  firstChar,
  onAutoFocusHandled,
  onContentChange,
  onDragHandleDown,
  onHeightChange,
  onResizeHandleDown,
}: SegmentBlockViewProps) {
  const elementRef = useAutoGrowHeight(segment.id, segment.height, onHeightChange);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Always: stops a click/drag-to-edit inside a segment from bubbling
    // up to CanvasViewport's own pointerdown handler, which would
    // otherwise start a viewport pan drag instead of placing a text
    // caret or (below) reposition-dragging this segment.
    event.stopPropagation();
    if (event.button !== 0) return;
    // `currentTarget` is this wrapper div itself; `target` is whatever
    // was actually under the pointer — the border/padding area hits the
    // wrapper directly, while the text content hits a ProseMirror
    // descendant. Only the former starts a drag; the latter is left
    // alone to place a caret normally.
    if (event.target !== event.currentTarget) return;
    event.preventDefault(); // don't let the browser start its own native drag-selection gesture on the wrapper
    onDragHandleDown(segment.id, event.clientX, event.clientY);
  }

  function handleResizeHandlePointerDown(event: ReactPointerEvent<HTMLDivElement>, edge: "left" | "right") {
    event.stopPropagation(); // don't also trigger the wrapper's own reposition-drag or bubble up to CanvasViewport's pan
    if (event.button !== 0) return;
    event.preventDefault();
    onResizeHandleDown(segment.id, edge, event.clientX);
  }

  return (
    <div
      ref={elementRef}
      className={`segment-block segment-block--${segment.visibility}`}
      // `minHeight`, not `height`: content still grows the box taller
      // (docs/architecture.md §7's "auto-grows downward") — this keeps
      // a deliberately drag-drawn rectangle (NTA-38) or a stored
      // measured height (NTA-40) from visually shrinking below its
      // known size, without ever *capping* growth.
      style={{
        left: segment.x,
        top: segment.y,
        width: segment.width,
        minHeight: segment.height,
        zIndex: segment.zIndex,
      }}
      onPointerDown={handlePointerDown}
    >
      <div
        className="segment-block__resize-handle segment-block__resize-handle--left"
        onPointerDown={(event) => handleResizeHandlePointerDown(event, "left")}
      />
      <RichTextEngineProvider content={segment.content} onChange={(doc) => onContentChange(segment.id, doc)}>
        <SegmentEditor autoFocus={autoFocus} firstChar={firstChar} onAutoFocusHandled={onAutoFocusHandled} />
      </RichTextEngineProvider>
      <div
        className="segment-block__resize-handle segment-block__resize-handle--right"
        onPointerDown={(event) => handleResizeHandlePointerDown(event, "right")}
      />
    </div>
  );
}

/**
 * Watches `elementRef`'s own rendered height via `ResizeObserver` and
 * calls `onHeightChange(id, height)` whenever it differs from the
 * currently-known `height` — NTA-40's auto-grow persistence (see this
 * file's header comment). Returns the ref to attach to the observed
 * element. A plain effect + `ResizeObserver`, not a third-party hook,
 * since this is the only place in the workspace that needs one.
 */
function useAutoGrowHeight(
  segmentId: string,
  knownHeight: number,
  onHeightChange: (id: string, height: number) => void,
) {
  const elementRef = useRef<HTMLDivElement>(null);
  const knownHeightRef = useRef(knownHeight);
  knownHeightRef.current = knownHeight;
  const onHeightChangeRef = useRef(onHeightChange);
  onHeightChangeRef.current = onHeightChange;
  const segmentIdRef = useRef(segmentId);
  segmentIdRef.current = segmentId;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.borderBoxSize?.[0]?.blockSize ?? entries[0]?.contentRect.height;
      if (measured === undefined || Math.round(measured) === Math.round(knownHeightRef.current)) return;
      onHeightChangeRef.current(segmentIdRef.current, measured);
    });
    observer.observe(element);
    return () => observer.disconnect();
    // Deliberately just `[]`: re-observing on every `segmentId` change
    // isn't needed since `SegmentBlockView` unmounts/remounts (a new
    // `key`) rather than reusing this instance for a different segment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return elementRef;
}

interface SegmentEditorProps {
  autoFocus: boolean;
  firstChar: string | undefined;
  onAutoFocusHandled: () => void;
}

function SegmentEditor({ autoFocus, firstChar, onAutoFocusHandled }: SegmentEditorProps) {
  const editor = useRichTextEditor();
  // Guards against React StrictMode's double-invoked mount effects
  // running this insert twice in dev.
  const handledRef = useRef(false);

  useEffect(() => {
    if (!autoFocus || !editor || handledRef.current) return;
    handledRef.current = true;
    editor.commands.focus("end");
    if (firstChar) editor.commands.insertContent(firstChar);
    onAutoFocusHandled();
  }, [autoFocus, editor, firstChar, onAutoFocusHandled]);

  return <EditorContent editor={editor} />;
}
