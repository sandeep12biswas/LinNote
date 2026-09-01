// The app-side glue for NTA-37: bridges canvas-core's `useNotePageStore`/
// `useCanvasCoordinates()` (./index.ts, ./CanvasViewport.tsx) to
// plugins/element-text-segment's portable, prop-driven `SegmentLayer`.
// Mounted by ../shell/AppShell.tsx as `CanvasViewport`'s `children`, so
// it renders inside the pan/zoom-transformed layer alongside the page's
// other content.
//
// `SegmentLayer` never imports from apps/desktop/src/* (a plugin
// importing app-internal modules would be the reverse of this repo's
// intended dependency direction) — this file is the one place that
// narrows the app's real `SegmentBlock`/`CanvasElement` (../types) down
// to the plugin's own structurally-equivalent `SegmentBlockData`, and
// turns its callbacks back into real store actions.

import { useCallback, useMemo } from "react";
import { SegmentLayer, type SegmentBlockData } from "@linnote/plugin-element-text-segment";
import type { RichTextDoc } from "@linnote/rich-text-engine";
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
}

export function SegmentLayerHost({ pageId }: SegmentLayerHostProps) {
  const notePage = useNotePageStore((state) => state.pages[pageId]);
  const addElement = useNotePageStore((state) => state.addElement);
  const updateElement = useNotePageStore((state) => state.updateElement);
  const { pointerPosition } = useCanvasCoordinates();

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

  if (!notePage) return null;

  return (
    <SegmentLayer
      segments={segments}
      pointerPosition={pointerPosition}
      onCreateSegment={handleCreateSegment}
      onSegmentContentChange={handleSegmentContentChange}
    />
  );
}
