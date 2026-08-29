import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Ink — core.element.ink
// Pointer capture -> perfect-freehand outline -> Path2D paint, tiled per §14. Pen/highlighter/eraser tools (Desing architecture §9).
// TODO(phase-3): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.element.ink",
    name: "Ink",
    version: "0.1.0",
    contributes: {
      canvasElementTypes: [
      // TODO: register this element type's renderer with canvas-core.
    ],
    },
  },
  activate(_ctx: PluginContext) {
    // TODO(phase-3): register the contribution(s) above with the
    // registry via ctx, and wire up any toolbar/menu entry.
  },
};

export default plugin;
