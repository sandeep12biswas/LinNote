import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// YouTube Embed — core.element.youtube-embed
// Inline (sandboxed youtube-nocookie.com iframe) vs. external (system browser via shell.open) playback, chosen once at insert time (Desing architecture §10.2).
// TODO(phase-7): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.element.youtube-embed",
    name: "YouTube Embed",
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
