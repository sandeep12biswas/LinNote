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
// Two responsibilities:
// 1. Render every existing segment via @linnote/rich-text-engine's
//    RichTextEngineProvider + EditorContent — border invisible by
//    default (`visibility: "invisible"`), revealed on hover/focus via
//    CSS (apps/desktop/src/App.css's `.segment-block` rules). NTA-38's
//    "deliberate visible creation" reuses this same renderer via
//    `visibility: "visible"` — no changes needed here for that.
// 2. The create-on-type gesture: on the first printable keystroke with
//    nothing else focused and no existing segment under the pointer's
//    last-known canvas-space position, create a new (empty) segment
//    there, focus it, and feed it that keystroke.
//
// TODO(NTA-39/40): drag/reposition and real auto-grow-height/manual-
// resize-width are separate subtasks of this same story (NTA-32) —
// `width`/`height` below are placeholder defaults, not yet kept in sync
// with rendered size, and nothing here lets a segment be dragged yet.

import { useEffect, useRef, useState } from "react";
import {
  EditorContent,
  RichTextEngineProvider,
  useRichTextEditor,
  type RichTextDoc,
} from "@linnote/rich-text-engine";

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
  /** The pointer's last known canvas-space position (see canvas-core's `useCanvasCoordinates()`) — `null` when it isn't over the canvas. Drives the create-on-type gesture's placement. */
  pointerPosition: CanvasPoint | null;
  /** Called to commit a brand-new segment (already carrying the just-typed first character, once its own editor mounts) onto the page. */
  onCreateSegment: (segment: SegmentBlockData) => void;
  /** Called whenever an existing segment's rich-text content changes. */
  onSegmentContentChange: (id: string, content: RichTextDoc) => void;
}

export function SegmentLayer({
  segments,
  pointerPosition,
  onCreateSegment,
  onSegmentContentChange,
}: SegmentLayerProps) {
  // Refs mirroring the latest props: the keydown listener below is
  // attached once (empty deps) rather than re-attached on every
  // pointermove, so it always sees the latest segments/pointer without
  // thrashing the window listener on every mouse move.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const pointerPositionRef = useRef(pointerPosition);
  pointerPositionRef.current = pointerPosition;
  const onCreateSegmentRef = useRef(onCreateSegment);
  onCreateSegmentRef.current = onCreateSegment;

  const [pendingFocus, setPendingFocus] = useState<{ id: string; firstChar: string } | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isCreateOnTypeKey(event)) return;

      const point = pointerPositionRef.current;
      if (!point) return; // pointer isn't over the canvas at all

      const currentSegments = segmentsRef.current;
      if (currentSegments.some((segment) => isPointInsideSegment(point, segment))) return; // NTA-37 is empty-space-only; an existing segment under the cursor is left alone

      const segment: SegmentBlockData = {
        id: `segment-${crypto.randomUUID()}`,
        type: "segment",
        visibility: "invisible",
        x: point.x,
        y: point.y,
        width: DEFAULT_SEGMENT_WIDTH,
        height: DEFAULT_SEGMENT_HEIGHT,
        content: undefined,
        zIndex: nextZIndex(currentSegments),
      };

      event.preventDefault();
      onCreateSegmentRef.current(segment);
      setPendingFocus({ id: segment.id, firstChar: event.key });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
      style={{ left: segment.x, top: segment.y, width: segment.width, zIndex: segment.zIndex }}
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
