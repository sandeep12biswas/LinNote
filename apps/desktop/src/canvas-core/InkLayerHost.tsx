// The app-side glue for NTA-90/91/92/93: bridges canvas-core's
// `useNotePageStore`/`useCanvasCoordinates()` (./index.ts,
// ./CanvasViewport.tsx) and the app's shared `CommandBus`
// (../registry/createContext.ts) to plugins/element-ink's portable,
// prop-driven `InkLayer` — same role ./SegmentLayerHost.tsx plays for
// `SegmentLayer`, ./FileAttachmentHost.tsx for `FileAttachmentLayer`; see
// either of their header comments for the shared reasoning (narrowing —
// or here, since `InkStrokeData` mirrors `InkStroke` field-for-field,
// simply *reusing* — the app's real element type, turning callbacks back
// into real store actions, installing the real, page-aware handler for
// `TOGGLE_INK_PANEL_COMMAND` onto the shared `CommandBus`, overwriting
// the console.log fallback the plugin's own activate() registers).
//
// Unlike ./SegmentLayerHost.tsx/./FileAttachmentHost.tsx's own move/
// resize channels, nothing here goes through ./coalescer.ts: `InkLayer`
// itself already holds a stroke's in-progress points (`onCommitStroke`)
// and an eraser drag's in-progress working set (`onEraseStrokes`)
// entirely in its own local state — the real store is never touched
// until the gesture finishes, so there's no live-external-observer need
// a coalescer would otherwise exist for. Both callbacks fire once per
// gesture, so both go through `useCanvasCommandStore`'s `execute` (runs
// the mutation immediately + pushes) — same reasoning as
// SegmentLayerHost's `handleCreateSegment`, never `commit` (which
// assumes the mutation already happened, the way a coalescer's `apply()`
// does for a live drag). `computeEraseDiff` is what turns an eraser
// drag's before/after snapshots into the removed/added strokes an erase
// `Command` needs — both directions (`execute`/`undo`) just replay that
// diff against the store; see plugins/element-ink/src/ink.ts's own doc
// comment on why untouched strokes never change id, so this diff is
// exactly what actually changed, not every stroke on the page.
//
// A no-op erase (the drag never actually touched anything —
// `removedStrokes`/`addedStrokes` both empty) never reaches the undo
// stack at all, same "don't push a command for a change that didn't
// happen" discipline `./coalescer.ts`'s `settle()` already applies via
// `isEqual`.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { computeEraseDiff, InkLayer, TOGGLE_INK_PANEL_COMMAND, type InkStrokeData } from "@linnote/plugin-element-ink";
import type { CommandBus } from "../registry";
import type { CanvasElement, InkStroke } from "../types";
import { useCanvasCommandStore } from "./commandStack";
import { useCanvasCoordinates } from "./CanvasViewport";
import { useNotePageStore } from "./index";

function isInkStroke(element: CanvasElement): element is InkStroke {
  return element.type === "ink";
}

export interface InkLayerHostProps {
  pageId: string;
  /** See ./SegmentLayerHost.tsx's own doc comment for why direct `CommandBus` access, not just `ctx.commands`, is needed here. */
  commandBus: CommandBus;
}

export function InkLayerHost({ pageId, commandBus }: InkLayerHostProps) {
  const notePage = useNotePageStore((state) => state.pages[pageId]);
  const addElement = useNotePageStore((state) => state.addElement);
  const removeElement = useNotePageStore((state) => state.removeElement);
  // `visibleRect` drives NTA-73's tile culling inside `InkLayer` itself —
  // this host just forwards it, same "narrow the app's real type down to
  // whatever the portable plugin needs" role as every other prop below.
  const { pointerPosition, screenToCanvas, setPanSuppressed, visibleRect } = useCanvasCoordinates();

  const strokes: InkStrokeData[] = useMemo(
    () => (notePage ? notePage.elements.filter(isInkStroke) : []),
    [notePage],
  );

  const handleCommitStroke = useCallback(
    (stroke: InkStrokeData) => {
      // A one-shot insert, not a burst — same reasoning as
      // SegmentLayerHost's `handleCreateSegment`.
      useCanvasCommandStore.getState().execute({
        label: "Draw stroke",
        execute: () => addElement(pageId, stroke as CanvasElement),
        undo: () => removeElement(pageId, stroke.id),
      });
    },
    [addElement, removeElement, pageId],
  );

  const handleEraseStrokes = useCallback(
    (before: InkStrokeData[], after: InkStrokeData[]) => {
      const { removedStrokes, addedStrokes } = computeEraseDiff(before, after);
      if (removedStrokes.length === 0 && addedStrokes.length === 0) return; // the drag never actually touched anything
      useCanvasCommandStore.getState().execute({
        label: "Erase ink",
        execute: () => {
          for (const stroke of removedStrokes) removeElement(pageId, stroke.id);
          for (const stroke of addedStrokes) addElement(pageId, stroke as CanvasElement);
        },
        undo: () => {
          for (const stroke of addedStrokes) removeElement(pageId, stroke.id);
          for (const stroke of removedStrokes) addElement(pageId, stroke as CanvasElement);
        },
      });
    },
    [addElement, removeElement, pageId],
  );

  // `InkLayer` hands us its own "toggle the tool panel" trigger once (see
  // its `onTogglePanelReady` doc comment); stashed in a ref so the
  // CommandBus registration effect below doesn't need to re-run every
  // time it's (re-)supplied — same pattern as
  // ./SegmentLayerHost.tsx's own `armCreateVisibleRef`.
  const togglePanelRef = useRef<(() => void) | null>(null);
  const handleTogglePanelReady = useCallback((togglePanel: () => void) => {
    togglePanelRef.current = togglePanel;
  }, []);

  useEffect(() => {
    commandBus.register(TOGGLE_INK_PANEL_COMMAND, () => togglePanelRef.current?.());
    return () => commandBus.unregister(TOGGLE_INK_PANEL_COMMAND);
  }, [commandBus]);

  if (!notePage) return null;

  return (
    <InkLayer
      strokes={strokes}
      onCommitStroke={handleCommitStroke}
      onEraseStrokes={handleEraseStrokes}
      pointerPosition={pointerPosition}
      screenToCanvas={screenToCanvas}
      setPanSuppressed={setPanSuppressed}
      onTogglePanelReady={handleTogglePanelReady}
      visibleRect={visibleRect}
    />
  );
}
