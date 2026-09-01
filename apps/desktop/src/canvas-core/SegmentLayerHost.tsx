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

import { useCallback, useEffect, useMemo, useRef } from "react";
import { CREATE_VISIBLE_SEGMENT_COMMAND, SegmentLayer, type SegmentBlockData } from "@linnote/plugin-element-text-segment";
import type { RichTextDoc } from "@linnote/rich-text-engine";
import type { CommandBus } from "../registry";
import type { CanvasElement, SegmentBlock } from "../types";
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
  const updateElement = useNotePageStore((state) => state.updateElement);
  const { pointerPosition, screenToCanvas, setPanSuppressed } = useCanvasCoordinates();

  const segments = useMemo(
    () => (notePage ? notePage.elements.filter(isSegment).map(toSegmentBlockData) : []),
    [notePage],
  );

  const handleCreateSegment = useCallback(
    (segment: SegmentBlockData) => {
      addElement(pageId, segment as SegmentBlock);
    },
    [addElement, pageId],
  );

  const handleSegmentContentChange = useCallback(
    (id: string, content: RichTextDoc) => {
      updateElement(pageId, id, (element) => ({ ...element, content }) as CanvasElement);
    },
    [pageId, updateElement],
  );

  const handleMoveSegment = useCallback(
    (id: string, x: number, y: number) => {
      updateElement(pageId, id, (element) => ({ ...element, x, y }) as CanvasElement);
    },
    [pageId, updateElement],
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
      screenToCanvas={screenToCanvas}
      onCreateVisibleSegmentReady={handleCreateVisibleSegmentReady}
      setPanSuppressed={setPanSuppressed}
    />
  );
}
