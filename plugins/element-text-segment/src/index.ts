import type { Plugin, PluginContext } from "@linnote/plugin-sdk";
import { CREATE_VISIBLE_SEGMENT_COMMAND } from "./SegmentLayer";

// Text Segment — core.element.text-segment
// SegmentBlock renderer, collision/non-overlap logic (block-and-snap, §7.2), insert/drag/resize commands. Segment mechanics and text formatting are independent concerns (Desing architecture §7.3).
//
// NTA-37 implements the renderer + the "invisible create-on-type" gesture
// — see ./SegmentLayer.tsx for the component itself and its own header
// comment for the app-side mounting contract (canvas-core's
// SegmentLayerHost, not the `canvasElementTypes` contribution below —
// that contribution's `render` field doesn't exist yet, see
// @linnote/plugin-sdk's own TODO on `CanvasElementTypeContribution`).
//
// NTA-38 adds the deliberate visible-creation gesture (also
// ./SegmentLayer.tsx), triggered by the toolbar/menu entry below —
// `CREATE_VISIBLE_SEGMENT_COMMAND`'s *real* behavior (it needs to know
// which page is open, which this plugin structurally can't) is installed
// by apps/desktop/src/canvas-core/SegmentLayerHost.tsx once a page is
// open, overwriting the console.log fallback registered here at
// activate() time — the same shared `ctx.commands`/`CommandBus` table
// either side can register against (registry/createContext.ts's own
// header comment already documents it that way).
//
// TODO(NTA-39/40/41): drag/reposition, auto-grow/resize, non-overlap.
export const plugin: Plugin = {
  manifest: {
    id: "core.element.text-segment",
    name: "Text Segment",
    version: "0.1.0",
    contributes: {
      canvasElementTypes: [{ type: "segment" }],
      menu: [{ menu: "Edit", label: "Add Segment", commandId: CREATE_VISIBLE_SEGMENT_COMMAND, priority: 10 }],
      toolbar: [{ label: "Add Segment", commandId: CREATE_VISIBLE_SEGMENT_COMMAND, priority: 10 }],
    },
  },
  activate(ctx: PluginContext) {
    ctx.canvas.registerElementType({ type: "segment" });
    ctx.commands.register(CREATE_VISIBLE_SEGMENT_COMMAND, () => {
      console.log(
        `[core.element.text-segment] "${CREATE_VISIBLE_SEGMENT_COMMAND}" run (no canvas mounted yet — real behavior is installed by canvas-core/SegmentLayerHost.tsx once a page is open)`,
      );
    });
  },
};

export default plugin;

export {
  CREATE_VISIBLE_SEGMENT_COMMAND,
  DEFAULT_SEGMENT_HEIGHT,
  DEFAULT_SEGMENT_WIDTH,
  isPointInsideSegment,
  nextZIndex,
  SegmentLayer,
  type CanvasPoint,
  type SegmentBlockData,
  type SegmentLayerProps,
} from "./SegmentLayer";
