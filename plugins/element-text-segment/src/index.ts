import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Text Segment — core.element.text-segment
// SegmentBlock renderer, collision/non-overlap logic (block-and-snap, §7.2), insert/drag/resize commands. Segment mechanics and text formatting are independent concerns (Desing architecture §7.3).
//
// NTA-37 implements the renderer + the "invisible create-on-type" gesture
// — see ./SegmentLayer.tsx for the component itself and its own header
// comment for the app-side mounting contract (canvas-core's
// SegmentLayerHost, not the `canvasElementTypes` contribution below —
// that contribution's `render` field doesn't exist yet, see
// @linnote/plugin-sdk's own TODO on `CanvasElementTypeContribution`).
// TODO(NTA-39/40/41): drag/reposition, auto-grow/resize, non-overlap.
export const plugin: Plugin = {
  manifest: {
    id: "core.element.text-segment",
    name: "Text Segment",
    version: "0.1.0",
    contributes: {
      canvasElementTypes: [{ type: "segment" }],
    },
  },
  activate(ctx: PluginContext) {
    ctx.canvas.registerElementType({ type: "segment" });
  },
};

export default plugin;

export {
  DEFAULT_SEGMENT_HEIGHT,
  DEFAULT_SEGMENT_WIDTH,
  isPointInsideSegment,
  nextZIndex,
  SegmentLayer,
  type CanvasPoint,
  type SegmentBlockData,
  type SegmentLayerProps,
} from "./SegmentLayer";
