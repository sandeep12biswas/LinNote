import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Image — core.element.image
// Pasted/inserted image element, written to a per-note asset folder and referenced by relative path (Desing architecture §6, §15.2).
// TODO(phase-7): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.element.image",
    name: "Image",
    version: "0.1.0",
    contributes: {
      canvasElementTypes: [
      // TODO: register this element type's renderer with canvas-core.
    ],
    },
  },
  activate(_ctx: PluginContext) {
    // TODO(phase-7): register the contribution(s) above with the
    // registry via ctx, and wire up any toolbar/menu entry.
  },
};

export default plugin;
