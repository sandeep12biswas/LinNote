// The app-side glue for NTA-63/64: bridges canvas-core's
// `useNotePageStore`/`useCanvasCoordinates()` (./index.ts,
// ./CanvasViewport.tsx) and the app's shared `CommandBus`
// (../registry/createContext.ts) to plugins/element-youtube-embed's
// portable, prop-driven `YouTubeEmbedLayer` — same role
// ./SegmentLayerHost.tsx plays for `SegmentLayer`, and
// ./FileAttachmentHost.tsx for `FileAttachmentLayer`; see either of
// their header comments for the shared reasoning.
//
// `INSERT_YOUTUBE_EMBED_COMMAND`'s real handler just arms the plugin's
// insert dialog (`onInsertDialogReady`, mirrored from
// SegmentLayerHost.tsx's own `armCreateVisibleRef`/
// `onCreateVisibleSegmentReady` pattern for NTA-38's deliberate-creation
// gesture) — the dialog itself collects the URL and play-mode choice, so
// unlike FileAttachmentHost.tsx there's no native dialog/file-picker
// call to make here.
//
// NTA-66/67 (Phase 8): move routes through ./coalescer.ts's
// `createCoalescer`; embed creation through `useCanvasCommandStore`'s
// `execute` — same pattern, same reasoning, as ./FileAttachmentHost.tsx.

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  INSERT_YOUTUBE_EMBED_COMMAND,
  YouTubeEmbedLayer,
  type YouTubeEmbedData,
} from "@linnote/plugin-element-youtube-embed";
import type { CommandBus } from "../registry";
import type { CanvasElement, YouTubeEmbed } from "../types";
import { createCoalescer } from "./coalescer";
import { registerFlushHook, useCanvasCommandStore } from "./commandStack";
import { useCanvasCoordinates } from "./CanvasViewport";
import { useNotePageStore } from "./index";

function isYouTubeEmbed(element: CanvasElement): element is YouTubeEmbed {
  return element.type === "youtube-embed";
}

export interface YouTubeEmbedHostProps {
  pageId: string;
  /** See ./SegmentLayerHost.tsx's own doc comment for why direct `CommandBus` access, not just `ctx.commands`, is needed here. */
  commandBus: CommandBus;
}

export function YouTubeEmbedHost({ pageId, commandBus }: YouTubeEmbedHostProps) {
  const notePage = useNotePageStore((state) => state.pages[pageId]);
  const addElement = useNotePageStore((state) => state.addElement);
  const removeElement = useNotePageStore((state) => state.removeElement);
  const updateElement = useNotePageStore((state) => state.updateElement);
  const { pointerPosition, screenToCanvas, setPanSuppressed } = useCanvasCoordinates();

  const embeds = useMemo(() => (notePage ? notePage.elements.filter(isYouTubeEmbed) : []), [notePage]);

  const handleCreateEmbed = useCallback(
    (embed: YouTubeEmbedData) => {
      // A one-shot insert, not a burst — same reasoning as
      // SegmentLayerHost's `handleCreateSegment`.
      useCanvasCommandStore.getState().execute({
        label: "Insert YouTube embed",
        execute: () => addElement(pageId, embed as CanvasElement),
        undo: () => removeElement(pageId, embed.id),
      });
    },
    [addElement, removeElement, pageId],
  );

  const moveCoalescer = useMemo(
    () =>
      createCoalescer<{ x: number; y: number }>({
        getCurrent: (id) => {
          const embed = useNotePageStore.getState().pages[pageId]?.elements.find((el) => el.id === id);
          return embed && isYouTubeEmbed(embed) ? { x: embed.x, y: embed.y } : { x: 0, y: 0 };
        },
        apply: (id, { x, y }) => updateElement(pageId, id, (element) => ({ ...element, x, y }) as CanvasElement),
        commit: (command) => useCanvasCommandStore.getState().commit(command),
        label: () => "Move YouTube embed",
        isEqual: (a, b) => a.x === b.x && a.y === b.y,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageId],
  );
  useEffect(() => () => moveCoalescer.cancelAll(), [moveCoalescer]);
  // See ./SegmentLayerHost.tsx's own identical effect + ./commandStack.ts's
  // `registerFlushHook` doc comment for why.
  useEffect(() => registerFlushHook(() => moveCoalescer.flushAll()), [moveCoalescer]);

  const handleMoveEmbed = useCallback((id: string, x: number, y: number) => moveCoalescer.update(id, { x, y }), [moveCoalescer]);

  // Same "stash the plugin's own arm trigger in a ref" pattern as
  // ./SegmentLayerHost.tsx's `armCreateVisibleRef` — the effect below
  // that registers `INSERT_YOUTUBE_EMBED_COMMAND` doesn't need to re-run
  // every time `YouTubeEmbedLayer` (re-)supplies it.
  const openDialogRef = useRef<(() => void) | null>(null);
  const handleInsertDialogReady = useCallback((openDialog: () => void) => {
    openDialogRef.current = openDialog;
  }, []);

  useEffect(() => {
    commandBus.register(INSERT_YOUTUBE_EMBED_COMMAND, () => openDialogRef.current?.());
    return () => commandBus.unregister(INSERT_YOUTUBE_EMBED_COMMAND);
  }, [commandBus]);

  if (!notePage) return null;

  return (
    <YouTubeEmbedLayer
      embeds={embeds}
      onCreateEmbed={handleCreateEmbed}
      onMoveEmbed={handleMoveEmbed}
      pointerPosition={pointerPosition}
      screenToCanvas={screenToCanvas}
      setPanSuppressed={setPanSuppressed}
      onInsertDialogReady={handleInsertDialogReady}
    />
  );
}
