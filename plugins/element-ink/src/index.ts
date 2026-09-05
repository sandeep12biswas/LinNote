import type { Plugin, PluginContext } from "@linnote/plugin-sdk";
import { TOGGLE_INK_PANEL_COMMAND } from "./InkLayer";

// Ink — core.element.ink
// Pointer capture -> perfect-freehand outline -> Path2D paint. Pen/highlighter/eraser tools (Desing architecture §5/§9).
//
// NTA-91 implements the renderer + stroke capture/rendering — see
// ./InkLayer.tsx for the component itself and its own header comment for
// the app-side mounting contract (canvas-core's InkLayerHost, not the
// `canvasElementTypes` contribution below — that contribution's `render`
// field doesn't exist yet, see @linnote/plugin-sdk's own TODO on
// `CanvasElementTypeContribution`, same as
// plugins/element-text-segment/src/index.ts's header comment).
//
// NTA-92 adds tool selection (pen/highlighter/eraser + color/size),
// triggered by the toolbar/menu entry below — `TOGGLE_INK_PANEL_COMMAND`'s
// *real* behavior (showing/hiding ./InkLayer.tsx's own tool panel) is
// installed by apps/desktop/src/canvas-core/InkLayerHost.tsx once a page
// is open, overwriting the console.log fallback registered here at
// activate() time — same shared `ctx.commands`/`CommandBus` table either
// side can register against (registry/createContext.ts's own header
// comment already documents it that way).
//
// NTA-93 adds the eraser's two modes (whole-stroke, pixel/segment split)
// — also ./InkLayer.tsx (and ./ink.ts for the pure hit-test/split math).
export const plugin: Plugin = {
  manifest: {
    id: "core.element.ink",
    name: "Ink",
    version: "0.1.0",
    contributes: {
      canvasElementTypes: [{ type: "ink" }],
      menu: [{ menu: "Edit", label: "Ink", commandId: TOGGLE_INK_PANEL_COMMAND, priority: 30 }],
      toolbar: [{ label: "Ink", commandId: TOGGLE_INK_PANEL_COMMAND, priority: 30 }],
    },
  },
  activate(ctx: PluginContext) {
    ctx.canvas.registerElementType({ type: "ink" });
    ctx.commands.register(TOGGLE_INK_PANEL_COMMAND, () => {
      console.log(
        `[core.element.ink] "${TOGGLE_INK_PANEL_COMMAND}" run (no canvas mounted yet — real behavior is installed by canvas-core/InkLayerHost.tsx once a page is open)`,
      );
    });
  },
};

export default plugin;

export {
  computeEraseDiff,
  computeStrokesBounds,
  eraseAtPoint,
  nextZIndex,
  strokeOutlinePath,
  strokeTouchesPoint,
  type InkPoint,
  type InkStrokeData,
  type InkTool,
} from "./ink";
export { InkLayer, TOGGLE_INK_PANEL_COMMAND, type CanvasPoint, type InkLayerProps } from "./InkLayer";
