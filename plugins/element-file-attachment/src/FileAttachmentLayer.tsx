// FileAttachment renderer (NTA-62, Desing architecture §10.1). Mounted by
// apps/desktop/src/canvas-core/FileAttachmentHost.tsx as one of
// `CanvasViewport`'s `children`, alongside `SegmentLayer`
// (plugins/element-text-segment) — same direct-import-from-the-app-side
// pattern that file's own header comment already documents (no `render`
// field on `CanvasElementTypeContribution` yet).
//
// `FileAttachmentData` mirrors `FileAttachment` in
// apps/desktop/src/types/index.ts field-for-field rather than importing
// it (a plugin importing an app-internal module would be the reverse of
// this repo's intended dependency direction) — the host narrows the app's
// real `FileAttachment[]` down to this shape at the boundary. Keep both
// in sync if the shape changes (CLAUDE.md's "Keep the data model in
// sync" note).
//
// Two responsibilities:
// 1. Render every attachment as an icon+filename block, positioned
//    absolute like a segment. Grabbing the block (not the icon/filename
//    text itself, which would otherwise make even a plain click start a
//    drag) reposition-drags it — same window-scoped pointermove/pointerup
//    pattern as plugins/element-text-segment's `SegmentLayer.tsx`
//    (NTA-39), minus that file's resize/non-overlap logic: neither is in
//    scope here (NTA-45's confirmed scope — drag-to-move only).
// 2. Double-click opens it. `@tauri-apps/plugin-shell`'s `open()` is
//    called directly by this plugin package (already an explicit
//    dependency, per docs/architecture.md §15/§17 and
//    apps/desktop/src/lib/tauri.ts's own header comment: "file/link-
//    opening work... goes through the relevant plugins/* package
//    (backed by @tauri-apps/plugin-shell)") — no host round-trip needed
//    for the *default* case. `resolveFileHandler` (NTA-65) is the one
//    piece that does need the host: it's built from every *active*
//    plugin's `fileHandlers` contribution (only the host can see
//    `registeredPlugins`/the shared `CommandBus`), and pre-empts the
//    default open when one matches this attachment's extension.

import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { open } from "@tauri-apps/plugin-shell";

export const INSERT_FILE_ATTACHMENT_COMMAND = "core.element.file-attachment.insert";

/** Icon+filename block size — fixed at insert time, no resize handles (NTA-45's confirmed scope). */
export const DEFAULT_ATTACHMENT_WIDTH = 220;
export const DEFAULT_ATTACHMENT_HEIGHT = 56;

export interface FileAttachmentData {
  id: string;
  type: "file-attachment";
  x: number;
  y: number;
  width: number;
  height: number;
  originalName: string;
  extension: string;
  assetPath: string;
  zIndex: number;
}

/** `path`'s final path segment, splitting on both `/` and `\` — the picked file may come from a Windows path (§14, cross-platform target). */
export function basenameFromPath(path: string): string {
  const segments = path.split(/[/\\]/);
  return segments[segments.length - 1] ?? path;
}

/** Lower-cased extension with no leading dot, or `""` if `fileName` has none. */
export function extensionFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

/** One past the highest `zIndex` currently in use — new elements always paint on top. */
export function nextZIndex(attachments: ReadonlyArray<{ zIndex: number }>): number {
  return attachments.reduce((max, item) => Math.max(max, item.zIndex), 0) + 1;
}

export interface FileAttachmentLayerProps {
  attachments: FileAttachmentData[];
  onMoveAttachment: (id: string, x: number, y: number) => void;
  /** See this file's header comment, point 2. `undefined` when no `fileHandlers` contribution matches. */
  resolveFileHandler?: (extension: string) => (() => void) | undefined;
  screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number };
  setPanSuppressed?: (suppressed: boolean) => void;
}

export function FileAttachmentLayer({
  attachments,
  onMoveAttachment,
  resolveFileHandler,
  screenToCanvas,
  setPanSuppressed,
}: FileAttachmentLayerProps) {
  // Refs mirror plugins/element-text-segment/src/SegmentLayer.tsx's own
  // "always read the latest prop/state from inside a window-scoped
  // listener registered once" convention (see that file's header comment,
  // point 4) — avoids re-registering the pointermove/pointerup listeners
  // on every render.
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const onMoveAttachmentRef = useRef(onMoveAttachment);
  onMoveAttachmentRef.current = onMoveAttachment;
  const screenToCanvasRef = useRef(screenToCanvas);
  screenToCanvasRef.current = screenToCanvas;
  const setPanSuppressedRef = useRef(setPanSuppressed);
  setPanSuppressedRef.current = setPanSuppressed;

  const draggingRef = useRef<{ id: string; startCanvas: { x: number; y: number }; startX: number; startY: number } | null>(
    null,
  );

  function handleDragHandleDown(id: string, clientX: number, clientY: number) {
    const attachment = attachmentsRef.current.find((candidate) => candidate.id === id);
    if (!attachment) return;
    draggingRef.current = {
      id,
      startCanvas: screenToCanvasRef.current(clientX, clientY),
      startX: attachment.x,
      startY: attachment.y,
    };
    setPanSuppressedRef.current?.(true);
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragging = draggingRef.current;
      if (!dragging) return;
      const point = screenToCanvasRef.current(event.clientX, event.clientY);
      onMoveAttachmentRef.current(
        dragging.id,
        dragging.startX + (point.x - dragging.startCanvas.x),
        dragging.startY + (point.y - dragging.startCanvas.y),
      );
    }
    function handlePointerUp() {
      if (!draggingRef.current) return;
      draggingRef.current = null;
      setPanSuppressedRef.current?.(false);
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function handleOpen(attachment: FileAttachmentData) {
    const handler = resolveFileHandler?.(attachment.extension);
    if (handler) {
      handler();
      return;
    }
    open(attachment.assetPath).catch((error) => {
      console.error(`[core.element.file-attachment] failed to open "${attachment.assetPath}" externally`, error);
    });
  }

  return (
    <div className="file-attachment-layer">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="file-attachment-block"
          style={{ left: attachment.x, top: attachment.y, width: attachment.width, height: attachment.height, zIndex: attachment.zIndex }}
          onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
            event.stopPropagation(); // don't let CanvasViewport start a pan-drag underneath this
            if (event.button !== 0) return;
            if (event.target !== event.currentTarget) return; // icon/filename text below is not a drag handle
            event.preventDefault();
            handleDragHandleDown(attachment.id, event.clientX, event.clientY);
          }}
          onDoubleClick={() => handleOpen(attachment)}
          title={attachment.originalName}
        >
          <span className="file-attachment-block__icon" aria-hidden="true">
            {attachment.extension ? attachment.extension.slice(0, 4).toUpperCase() : "FILE"}
          </span>
          <span className="file-attachment-block__name">{attachment.originalName}</span>
        </div>
      ))}
    </div>
  );
}
