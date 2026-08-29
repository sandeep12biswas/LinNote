import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Text Segment — core.element.text-segment
// SegmentBlock renderer, collision/non-overlap logic (block-and-snap, §7.2), insert/drag/resize commands. Segment mechanics and text formatting are independent concerns (Desing architecture §7.3).
// TODO(phase-4): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.element.text-segment",
    name: "Text Segment",
    version: "0.1.0",
    contributes: {
      canvasElementTypes: [
      // TODO: register this element type's renderer with canvas-core.
    ],
    },
  },
  activate(_ctx: PluginContext) {
    // TODO(phase-4): register the contribution(s) above with the
    // registry via ctx, and wire up any toolbar/menu entry.
  },
};

export default plugin;
