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
// Three responsibilities:
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
//
// TODO(NTA-39/40): drag/reposition an *existing* segment and real
// auto-grow-height/manual-resize-width are separate subtasks of this
// same story (NTA-32) — `width`/`height` are otherwise-placeholder
// defaults (or the drawn rectangle's own size for NTA-38), not kept in
// sync with rendered content size, and nothing here lets an existing
// segment be dragged yet.

import { useEffect, useRef, useState } from "react";
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
export const DEFAULT_SEGMENT_HEIGHT = 32; // TODO(NTA-40): replace with a real measured/auto-grown height.

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
}

function SegmentBlockView({ segment, autoFocus, firstChar, onAutoFocusHandled, onContentChange }: SegmentBlockViewProps) {
  return (
    <div
      className={`segment-block segment-block--${segment.visibility}`}
      // `minHeight`, not `height`: content still grows the box taller
      // (docs/architecture.md §7's "auto-grows downward") — this only
      // keeps a deliberately drag-drawn rectangle (NTA-38) from visually
      // shrinking below the size it was drawn at. Real measured-height
      // persistence back onto `segment.height` is NTA-40's job.
      style={{
        left: segment.x,
        top: segment.y,
        width: segment.width,
        minHeight: segment.height,
        zIndex: segment.zIndex,
      }}
      // Stops a click/drag-to-edit inside a segment from bubbling up to
      // CanvasViewport's own pointerdown handler, which would otherwise
      // start a viewport pan drag instead of placing a text caret.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <RichTextEngineProvider content={segment.content} onChange={(doc) => onContentChange(segment.id, doc)}>
        <SegmentEditor autoFocus={autoFocus} firstChar={firstChar} onAutoFocusHandled={onAutoFocusHandled} />
      </RichTextEngineProvider>
    </div>
  );
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
