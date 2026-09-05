// The app-side glue for NTA-62/65: bridges canvas-core's
// `useNotePageStore`/`useCanvasCoordinates()` (./index.ts,
// ./CanvasViewport.tsx), the app's shared `CommandBus`
// (../registry/createContext.ts), and `buildFileHandlers`
// (../shell/index.ts, NTA-65) to plugins/element-file-attachment's
// portable, prop-driven `FileAttachmentLayer` — same role
// ./SegmentLayerHost.tsx plays for `SegmentLayer`; see that file's
// header comment for the shared reasoning (narrowing the app's real
// `FileAttachment[]` down to the plugin's own structurally-equivalent
// `FileAttachmentData`, turning callbacks back into real store actions,
// installing the real, page-aware handler for
// `INSERT_FILE_ATTACHMENT_COMMAND` onto the shared `CommandBus`,
// overwriting the console.log fallback the plugin's own activate()
// registers).
//
// Two things this host does that SegmentLayerHost doesn't need to:
// 1. Picking the file itself — `@tauri-apps/plugin-dialog`'s `open()` —
//    lives here, not in the plugin package: it needs to feed a real path
//    into `addElement`, which only this host can call (the plugin
//    structurally can't reach `apps/desktop`'s state, same boundary
//    FileAttachmentLayer.tsx's own header comment already explains for
//    "open externally" the other direction). The picked path is used
//    as-is for `assetPath` — copying it into the page's own workspace
//    assets (`assets/<id>/...`) is Phase 8/NTA-69's job
//    (FileSystemPersistenceProvider doesn't exist yet), same
//    in-memory-only scope note as every other element type today.
// 2. `resolveFileHandler` — built from `buildFileHandlers(registeredPlugins)`
//    (NTA-65) — lets a future per-extension preview/open plugin pre-empt
//    FileAttachmentLayer's own default "open externally" without this
//    host or that plugin needing to know about each other directly.
//
// NTA-66/67 (Phase 8): move now routes through ./coalescer.ts's
// `createCoalescer` (same reasoning as ./SegmentLayerHost.tsx's own
// move/resize channels); insert goes through `useCanvasCommandStore`'s
// `execute` — a one-shot action, undone via the store's `removeElement`.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import {
  basenameFromPath,
  DEFAULT_ATTACHMENT_HEIGHT,
  DEFAULT_ATTACHMENT_WIDTH,
  extensionFromFileName,
  FileAttachmentLayer,
  INSERT_FILE_ATTACHMENT_COMMAND,
  nextZIndex,
  type FileAttachmentData,
} from "@linnote/plugin-element-file-attachment";
import type { CommandBus, RegisteredPlugin } from "../registry";
import { buildFileHandlers } from "../shell";
import type { CanvasElement, FileAttachment } from "../types";
import { createCoalescer } from "./coalescer";
import { registerFlushHook, useCanvasCommandStore } from "./commandStack";
import { useCanvasCoordinates } from "./CanvasViewport";
import { useNotePageStore } from "./index";

function isFileAttachment(element: CanvasElement): element is FileAttachment {
  return element.type === "file-attachment";
}

export interface FileAttachmentHostProps {
  pageId: string;
  /** See ./SegmentLayerHost.tsx's own doc comment for why direct `CommandBus` access, not just `ctx.commands`, is needed here. */
  commandBus: CommandBus;
  /** Feeds `resolveFileHandler` (NTA-65) — the same list `../shell/AppShell.tsx` already builds the menu bar/toolbar from. */
  registeredPlugins: RegisteredPlugin[];
}

export function FileAttachmentHost({ pageId, commandBus, registeredPlugins }: FileAttachmentHostProps) {
  const notePage = useNotePageStore((state) => state.pages[pageId]);
  const addElement = useNotePageStore((state) => state.addElement);
  const removeElement = useNotePageStore((state) => state.removeElement);
  const updateElement = useNotePageStore((state) => state.updateElement);
  const { screenToCanvas, setPanSuppressed } = useCanvasCoordinates();

  const attachments = useMemo(() => (notePage ? notePage.elements.filter(isFileAttachment) : []), [notePage]);

  const fileHandlers = useMemo(() => buildFileHandlers(registeredPlugins), [registeredPlugins]);
  const resolveFileHandler = useCallback(
    (extension: string) => {
      const handler = fileHandlers.get(extension.toLowerCase());
      if (!handler) return undefined;
      return () => commandBus.run(handler.commandId, attachments);
    },
    [fileHandlers, commandBus, attachments],
  );

  const moveCoalescer = useMemo(
    () =>
      createCoalescer<{ x: number; y: number }>({
        getCurrent: (id) => {
          const attachment = useNotePageStore.getState().pages[pageId]?.elements.find((el) => el.id === id);
          return attachment && isFileAttachment(attachment) ? { x: attachment.x, y: attachment.y } : { x: 0, y: 0 };
        },
        apply: (id, { x, y }) => updateElement(pageId, id, (element) => ({ ...element, x, y }) as CanvasElement),
        commit: (command) => useCanvasCommandStore.getState().commit(command),
        label: () => "Move file attachment",
        isEqual: (a, b) => a.x === b.x && a.y === b.y,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageId],
  );
  useEffect(() => () => moveCoalescer.cancelAll(), [moveCoalescer]);
  // See ./SegmentLayerHost.tsx's own identical effect + ./commandStack.ts's
  // `registerFlushHook` doc comment for why.
  useEffect(() => registerFlushHook(() => moveCoalescer.flushAll()), [moveCoalescer]);

  const handleMoveAttachment = useCallback(
    (id: string, x: number, y: number) => moveCoalescer.update(id, { x, y }),
    [moveCoalescer],
  );

  // `attachments` closes over `notePage`, which changes across
  // renders/page switches — kept in a ref (rather than a `commandBus`
  // dependency-list entry) so the registration effect below only ever
  // re-runs on a real `pageId`/`commandBus`/`addElement` change, same
  // "always read the latest value from inside a stable effect" concern
  // plugins/element-text-segment's SegmentLayer.tsx already documents.
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  useEffect(() => {
    async function handleInsert() {
      const path = await openFilePicker({ multiple: false });
      if (!path || Array.isArray(path)) return; // cancelled, or a multi-select result we didn't ask for
      const originalName = basenameFromPath(path);
      const attachment: FileAttachmentData = {
        id: crypto.randomUUID(),
        type: "file-attachment",
        x: 120,
        y: 120,
        width: DEFAULT_ATTACHMENT_WIDTH,
        height: DEFAULT_ATTACHMENT_HEIGHT,
        originalName,
        extension: extensionFromFileName(originalName),
        assetPath: path, // TODO(phase-8/NTA-69): copy into assets/<pageId>/... once FileSystemPersistenceProvider exists
        zIndex: nextZIndex(attachmentsRef.current),
      };
      // A one-shot insert, not a burst — `execute` (runs immediately +
      // pushes), not `commit` (which assumes the mutation already
      // happened), same as SegmentLayerHost's `handleCreateSegment`.
      useCanvasCommandStore.getState().execute({
        label: "Insert file attachment",
        execute: () => addElement(pageId, attachment as CanvasElement),
        undo: () => removeElement(pageId, attachment.id),
      });
    }

    commandBus.register(INSERT_FILE_ATTACHMENT_COMMAND, () => {
      handleInsert().catch((error) => {
        console.error("[core.element.file-attachment] insert failed", error);
      });
    });
    return () => commandBus.unregister(INSERT_FILE_ATTACHMENT_COMMAND);
  }, [pageId, commandBus, addElement, removeElement]);

  if (!notePage) return null;

  return (
    <FileAttachmentLayer
      attachments={attachments}
      onMoveAttachment={handleMoveAttachment}
      resolveFileHandler={resolveFileHandler}
      screenToCanvas={screenToCanvas}
      setPanSuppressed={setPanSuppressed}
    />
  );
}
