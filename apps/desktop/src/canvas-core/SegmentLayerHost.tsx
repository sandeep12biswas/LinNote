// The app-side glue for NTA-37/38: bridges canvas-core's
// `useNotePageStore`/`useCanvasCoordinates()` (./index.ts,
// ./CanvasViewport.tsx) and the app's shared `CommandBus`
// (../registry/createContext.ts, threaded down from ../App.tsx via
// ../shell/AppShell.tsx) to plugins/element-text-segment's portable,
// prop-driven `SegmentLayer`. Mounted by ../shell/AppShell.tsx as
// `CanvasViewport`'s `children`, so it renders inside the pan/zoom-
// transformed layer alongside the page's other content.
//
// `SegmentLayer` never imports from apps/desktop/src/* (a plugin
// importing app-internal modules would be the reverse of this repo's
// intended dependency direction) — this file is the one place that
// narrows the app's real `SegmentBlock`/`CanvasElement` (../types) down
// to the plugin's own structurally-equivalent `SegmentBlockData`, turns
// its callbacks back into real store actions, and — NTA-38 — installs
// the real, page-aware handler for `CREATE_VISIBLE_SEGMENT_COMMAND` onto
// the shared `CommandBus`, overwriting the console.log fallback the
// plugin's own activate() registers (see plugins/element-text-segment/
// src/index.ts's header comment and registry/createContext.ts's).
//
// NTA-39 also passes `screenToCanvas` straight through from
// `useCanvasCoordinates()` (already used for `pointerPosition`) — the
// drag/reposition gesture needs it directly; see `SegmentLayer`'s own
// header comment for why `pointerPosition` alone isn't enough for that
// one gesture.
//
// NTA-40 adds `handleHeightChange`/`handleResizeSegment` — same
// updateElement-based pattern as the move/content-change handlers above.
//
// NTA-66/67 (Phase 8): move, resize, and content-change now route
// through ./coalescer.ts's `createCoalescer` instead of calling
// `updateElement` directly — each still applies live/synchronously
// (`SegmentLayer`'s own gestures, and every existing test asserting on
// `useNotePageStore` state right after a pointer event, are unaffected),
// but the whole burst also settles into one `Command` on
// `useCanvasCommandStore` a moment later. `handleSegmentContentChange`
// is what unifies *formatting* into the same stack too, with zero
// changes to any `plugins/format-*` package — see ./commandStack.ts's
// header comment for why. `handleCreateSegment` (a one-shot, not a
// burst) goes through the store's `execute` instead, wrapped as its own
// undoable insert. `handleHeightChange` deliberately does NOT — auto-grow
// height is measured, not a gesture (same header comment).

import { useCallback, useEffect, useMemo, useRef } from "react";
import { CREATE_VISIBLE_SEGMENT_COMMAND, SegmentLayer, type SegmentBlockData } from "@linnote/plugin-element-text-segment";
import type { RichTextDoc } from "@linnote/rich-text-engine";
import type { CommandBus } from "../registry";
import type { CanvasElement, SegmentBlock } from "../types";
import { createCoalescer, flushInSequenceOrder } from "./coalescer";
import { registerFlushHook, useCanvasCommandStore } from "./commandStack";
import { useCanvasCoordinates } from "./CanvasViewport";
import { useNotePageStore } from "./index";

function isSegment(element: CanvasElement): element is SegmentBlock {
  return element.type === "segment";
}

/**
 * `SegmentBlock.content` is typed `unknown` in ../types on purpose (so
 * that app-level type doesn't need to depend on @linnote/rich-text-engine
 * just to describe its own domain model) — this is the one boundary that
 * narrows it back to `RichTextDoc | undefined` for the plugin, which does
 * know about TipTap's doc shape via @linnote/rich-text-engine.
 */
function toSegmentBlockData(segment: SegmentBlock): SegmentBlockData {
  return { ...segment, content: segment.content as RichTextDoc | undefined };
}

export interface SegmentLayerHostProps {
  pageId: string;
  /** The app-wide shared command bus (../App.tsx owns it) — see this file's header comment for why NTA-38 needs direct access to it, not just `ctx.commands` through a `PluginContext`. */
  commandBus: CommandBus;
}

export function SegmentLayerHost({ pageId, commandBus }: SegmentLayerHostProps) {
  const notePage = useNotePageStore((state) => state.pages[pageId]);
  const addElement = useNotePageStore((state) => state.addElement);
  const removeElement = useNotePageStore((state) => state.removeElement);
  const updateElement = useNotePageStore((state) => state.updateElement);
  const { pointerPosition, screenToCanvas, setPanSuppressed } = useCanvasCoordinates();

  const segments = useMemo(
    () => (notePage ? notePage.elements.filter(isSegment).map(toSegmentBlockData) : []),
    [notePage],
  );

  function findSegment(id: string): SegmentBlock | undefined {
    const element = useNotePageStore.getState().pages[pageId]?.elements.find((candidate) => candidate.id === id);
    return element && isSegment(element) ? element : undefined;
  }

  // One coalescer per mutation "channel" (NTA-67), recreated whenever
  // `pageId` changes — `cancelAll()` on the outgoing instance below (in
  // the same effect that clears them) is what stops a stale burst from
  // this page settling later against a *different* one after a switch.
  const moveCoalescer = useMemo(
    () =>
      createCoalescer<{ x: number; y: number }>({
        getCurrent: (id) => {
          const segment = findSegment(id);
          return { x: segment?.x ?? 0, y: segment?.y ?? 0 };
        },
        apply: (id, { x, y }) => updateElement(pageId, id, (element) => ({ ...element, x, y }) as CanvasElement),
        commit: (command) => useCanvasCommandStore.getState().commit(command),
        label: () => "Move segment",
        isEqual: (a, b) => a.x === b.x && a.y === b.y,
      }),
    // findSegment/updateElement close over pageId, which is already this memo's own key — recreated together, nothing exhaustive-deps would catch is actually stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageId],
  );
  const resizeCoalescer = useMemo(
    () =>
      createCoalescer<{ x: number; width: number }>({
        getCurrent: (id) => {
          const segment = findSegment(id);
          return { x: segment?.x ?? 0, width: segment?.width ?? 0 };
        },
        apply: (id, { x, width }) => updateElement(pageId, id, (element) => ({ ...element, x, width }) as CanvasElement),
        commit: (command) => useCanvasCommandStore.getState().commit(command),
        label: () => "Resize segment",
        isEqual: (a, b) => a.x === b.x && a.width === b.width,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageId],
  );
  const contentCoalescer = useMemo(
    () =>
      createCoalescer<RichTextDoc | undefined>({
        getCurrent: (id) => findSegment(id)?.content as RichTextDoc | undefined,
        apply: (id, content) => updateElement(pageId, id, (element) => ({ ...element, content }) as CanvasElement),
        commit: (command) => useCanvasCommandStore.getState().commit(command),
        label: () => "Edit text",
        isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageId],
  );

  useEffect(
    () => () => {
      moveCoalescer.cancelAll();
      resizeCoalescer.cancelAll();
      contentCoalescer.cancelAll();
    },
    [moveCoalescer, resizeCoalescer, contentCoalescer],
  );

  // Registers this Host's combined flush with ../canvas-core/commandStack.ts's
  // undo/redo (see registerFlushHook's own doc comment for why) — must
  // stay registered for as long as these coalescers are the live ones
  // (same dependency list as the cancelAll effect above), not just on
  // mount, since `pageId` changing recreates every coalescer above.
  useEffect(
    () => registerFlushHook(() => flushInSequenceOrder([moveCoalescer, resizeCoalescer, contentCoalescer])),
    [moveCoalescer, resizeCoalescer, contentCoalescer],
  );

  const handleCreateSegment = useCallback(
    (segment: SegmentBlockData) => {
      // A one-shot insert, not a burst — goes through `execute` (runs
      // immediately + pushes), not `commit` (which assumes the mutation
      // already happened).
      useCanvasCommandStore.getState().execute({
        label: "Create segment",
        execute: () => addElement(pageId, segment as SegmentBlock),
        undo: () => removeElement(pageId, segment.id),
      });
    },
    [addElement, removeElement, pageId],
  );

  const handleSegmentContentChange = useCallback(
    (id: string, content: RichTextDoc) => contentCoalescer.update(id, content),
    [contentCoalescer],
  );

  const handleMoveSegment = useCallback(
    (id: string, x: number, y: number) => moveCoalescer.update(id, { x, y }),
    [moveCoalescer],
  );

  // Deliberately NOT coalesced/commanded (NTA-66 scope decision) —
  // auto-grow height is a `ResizeObserver` measurement, not a user
  // gesture; wrapping it in undo history would mean undoing an unrelated
  // action also silently snapped a segment back to a stale height.
  const handleHeightChange = useCallback(
    (id: string, height: number) => {
      updateElement(pageId, id, (element) => ({ ...element, height }) as CanvasElement);
    },
    [pageId, updateElement],
  );

  const handleResizeSegment = useCallback(
    (id: string, x: number, width: number) => resizeCoalescer.update(id, { x, width }),
    [resizeCoalescer],
  );

  // `SegmentLayer` hands us its own "arm the visible-creation gesture"
  // trigger once (see its `onCreateVisibleSegmentReady` doc comment);
  // stashed in a ref so the CommandBus registration effect below doesn't
  // need to re-run every time it's (re-)supplied.
  const armCreateVisibleRef = useRef<(() => void) | null>(null);
  const handleCreateVisibleSegmentReady = useCallback((armCreateVisible: () => void) => {
    armCreateVisibleRef.current = armCreateVisible;
  }, []);

  useEffect(() => {
    commandBus.register(CREATE_VISIBLE_SEGMENT_COMMAND, () => armCreateVisibleRef.current?.());
    return () => commandBus.unregister(CREATE_VISIBLE_SEGMENT_COMMAND);
  }, [commandBus]);

  if (!notePage) return null;

  return (
    <SegmentLayer
      segments={segments}
      pointerPosition={pointerPosition}
      onCreateSegment={handleCreateSegment}
      onSegmentContentChange={handleSegmentContentChange}
      onMoveSegment={handleMoveSegment}
      onHeightChange={handleHeightChange}
      onResizeSegment={handleResizeSegment}
      screenToCanvas={screenToCanvas}
      onCreateVisibleSegmentReady={handleCreateVisibleSegmentReady}
      setPanSuppressed={setPanSuppressed}
    />
  );
}
