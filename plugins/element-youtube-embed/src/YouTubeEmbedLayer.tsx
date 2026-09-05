// YouTubeEmbed renderer + insert-time prompt (NTA-63/64, Desing
// architecture §10.2). Mounted by
// apps/desktop/src/canvas-core/YouTubeEmbedHost.tsx as one of
// `CanvasViewport`'s `children`, alongside `SegmentLayer`/
// `FileAttachmentLayer` — same direct-import-from-the-app-side pattern
// those files' own header comments already document.
//
// `YouTubeEmbedData` mirrors `YouTubeEmbed` in
// apps/desktop/src/types/index.ts field-for-field rather than importing
// it — see plugins/element-file-attachment/src/FileAttachmentLayer.tsx's
// header comment for why (same reasoning, same boundary).
//
// Three responsibilities:
// 1. Render every existing embed: `playMode: "inline"` is a sandboxed
//    `youtube-nocookie.com` iframe; `"external"` is a thumbnail + an
//    "Open in browser" button. Both sit under a thin drag-handle strip
//    (grabbing the iframe/thumbnail body itself must not start a drag —
//    the iframe in particular needs real pointer events for its own
//    playback controls). Drag-to-move only, same window-scoped
//    pointermove/pointerup pattern as
//    plugins/element-file-attachment/src/FileAttachmentLayer.tsx — no
//    resize handles (NTA-45's confirmed scope).
// 2. The insert-time prompt (NTA-64): `onInsertDialogReady` hands the
//    host a `() => void` once, the same "arm" callback shape
//    plugins/element-text-segment/src/SegmentLayer.tsx uses for its own
//    deliberate-creation gesture (`onCreateVisibleSegmentReady`) — the
//    host installs it as `INSERT_YOUTUBE_EMBED_COMMAND`'s real,
//    page-aware handler (overwriting the console.log fallback this
//    plugin's own activate() registers, per ./index.ts's header
//    comment). Opens a small modal: a URL field plus "Play here" /
//    "Open in browser" / Cancel.
// 3. "Open in browser" (both the external-mode button on an existing
//    embed and the dialog's own external choice go through the same
//    path) calls `@tauri-apps/plugin-shell`'s `open()` directly — no
//    host round-trip needed, same reasoning as FileAttachmentLayer's
//    header comment point 2.

import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { open } from "@tauri-apps/plugin-shell";

export const INSERT_YOUTUBE_EMBED_COMMAND = "core.element.youtube-embed.insert";

/** "Sized like an image element" (Desing architecture §10.2) — a 16:9 default. */
export const DEFAULT_EMBED_WIDTH = 480;
export const DEFAULT_EMBED_HEIGHT = 270;

export interface YouTubeEmbedData {
  id: string;
  type: "youtube-embed";
  x: number;
  y: number;
  width: number;
  height: number;
  videoUrl: string;
  playMode: "inline" | "external";
  zIndex: number;
}

/** One past the highest `zIndex` currently in use — new elements always paint on top. */
export function nextZIndex(embeds: ReadonlyArray<{ zIndex: number }>): number {
  return embeds.reduce((max, item) => Math.max(max, item.zIndex), 0) + 1;
}

const YOUTUBE_URL_PATTERN = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/;

/** The video id out of any of youtube.com/watch?v=, youtu.be/, youtube.com/embed/, youtube.com/shorts/, or youtube-nocookie.com/embed/ — `null` if `url` matches none of them. */
export function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_URL_PATTERN);
  return match ? match[1] : null;
}

export interface YouTubeEmbedLayerProps {
  embeds: YouTubeEmbedData[];
  onCreateEmbed: (embed: YouTubeEmbedData) => void;
  onMoveEmbed: (id: string, x: number, y: number) => void;
  /** Canvas-space placement for a newly-created embed — the host's last-known pointer position, same source `SegmentLayerHost` passes to `SegmentLayer`. `null` (e.g. dialog opened via menu, not toolbar-under-pointer) falls back to a fixed default. */
  pointerPosition: { x: number; y: number } | null;
  screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number };
  setPanSuppressed?: (suppressed: boolean) => void;
  /** See this file's header comment, point 2. Called once on mount. */
  onInsertDialogReady?: (openDialog: () => void) => void;
}

export function YouTubeEmbedLayer({
  embeds,
  onCreateEmbed,
  onMoveEmbed,
  pointerPosition,
  screenToCanvas,
  setPanSuppressed,
  onInsertDialogReady,
}: YouTubeEmbedLayerProps) {
  const embedsRef = useRef(embeds);
  embedsRef.current = embeds;
  const onMoveEmbedRef = useRef(onMoveEmbed);
  onMoveEmbedRef.current = onMoveEmbed;
  const screenToCanvasRef = useRef(screenToCanvas);
  screenToCanvasRef.current = screenToCanvas;
  const setPanSuppressedRef = useRef(setPanSuppressed);
  setPanSuppressedRef.current = setPanSuppressed;

  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    onInsertDialogReady?.(() => setDialogOpen(true));
  }, [onInsertDialogReady]);

  const draggingRef = useRef<{ id: string; startCanvas: { x: number; y: number }; startX: number; startY: number } | null>(
    null,
  );

  function handleDragHandleDown(id: string, clientX: number, clientY: number) {
    const embed = embedsRef.current.find((candidate) => candidate.id === id);
    if (!embed) return;
    draggingRef.current = {
      id,
      startCanvas: screenToCanvasRef.current(clientX, clientY),
      startX: embed.x,
      startY: embed.y,
    };
    setPanSuppressedRef.current?.(true);
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragging = draggingRef.current;
      if (!dragging) return;
      const point = screenToCanvasRef.current(event.clientX, event.clientY);
      onMoveEmbedRef.current(
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

  function handleOpenExternal(videoUrl: string) {
    open(videoUrl).catch((error) => {
      console.error(`[core.element.youtube-embed] failed to open "${videoUrl}" in the system browser`, error);
    });
  }

  function handleSubmit(videoUrl: string, playMode: "inline" | "external") {
    const embed: YouTubeEmbedData = {
      id: crypto.randomUUID(),
      type: "youtube-embed",
      x: pointerPosition?.x ?? 120,
      y: pointerPosition?.y ?? 120,
      width: DEFAULT_EMBED_WIDTH,
      height: DEFAULT_EMBED_HEIGHT,
      videoUrl,
      playMode,
      zIndex: nextZIndex(embedsRef.current),
    };
    onCreateEmbed(embed);
    setDialogOpen(false);
    if (playMode === "external") handleOpenExternal(videoUrl);
  }

  return (
    <div className="youtube-embed-layer">
      {embeds.map((embed) => {
        const videoId = extractYouTubeVideoId(embed.videoUrl);
        return (
          <div
            key={embed.id}
            className="youtube-embed-block"
            style={{ left: embed.x, top: embed.y, width: embed.width, height: embed.height, zIndex: embed.zIndex }}
          >
            <div
              className="youtube-embed-block__handle"
              onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                event.stopPropagation();
                if (event.button !== 0) return;
                event.preventDefault();
                handleDragHandleDown(embed.id, event.clientX, event.clientY);
              }}
            />
            {embed.playMode === "inline" && videoId ? (
              <iframe
                className="youtube-embed-block__frame"
                src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                title={embed.videoUrl}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                allowFullScreen
              />
            ) : (
              <div className="youtube-embed-block__external">
                {videoId && (
                  <img
                    className="youtube-embed-block__thumbnail"
                    src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                    alt=""
                  />
                )}
                <button type="button" onClick={() => handleOpenExternal(embed.videoUrl)}>
                  Open in browser
                </button>
              </div>
            )}
          </div>
        );
      })}
      {dialogOpen && <InsertYouTubeDialog onSubmit={handleSubmit} onCancel={() => setDialogOpen(false)} />}
    </div>
  );
}

interface InsertYouTubeDialogProps {
  onSubmit: (videoUrl: string, playMode: "inline" | "external") => void;
  onCancel: () => void;
}

/** NTA-64's "Play here" vs "Open in browser" prompt — a plain modal, no dialog library (none is a dependency anywhere in this repo yet). */
function InsertYouTubeDialog({ onSubmit, onCancel }: InsertYouTubeDialogProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent, playMode: "inline" | "external") {
    event.preventDefault();
    if (!extractYouTubeVideoId(url)) {
      setError("Enter a valid YouTube URL (youtube.com/watch?v=..., youtu.be/..., or a Shorts link).");
      return;
    }
    onSubmit(url, playMode);
  }

  return (
    <div className="youtube-embed-dialog__backdrop" onPointerDown={(event) => event.stopPropagation()}>
      <form className="youtube-embed-dialog" onSubmit={(event) => submit(event, "inline")}>
        <label htmlFor="youtube-embed-dialog__url">YouTube URL</label>
        <input
          id="youtube-embed-dialog__url"
          type="text"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setError(null);
          }}
          placeholder="https://www.youtube.com/watch?v=..."
          autoFocus
        />
        {error && <p className="youtube-embed-dialog__error">{error}</p>}
        <div className="youtube-embed-dialog__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={(event) => submit(event, "external")}>
            Open in browser
          </button>
          <button type="submit">Play here</button>
        </div>
      </form>
    </div>
  );
}
