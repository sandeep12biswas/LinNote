import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Font Color — core.format.font-color
// Text color mark; uses @linnote/contrast-util (core.util.contrast) for its default suggestion — an explicit dependency, NOT a dependency on format-font-size (Desing architecture §6.1, §8.2).
// TODO(phase-5): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.format.font-color",
    name: "Font Color",
    version: "0.1.0",
    contributes: {
      formatCommands: [
      // TODO: register this plugin's command(s) against @linnote/rich-text-engine.
    ],
    },
  },
  activate(_ctx: PluginContext) {
    // TODO(phase-5): register the contribution(s) above with the
    // registry via ctx, and wire up any toolbar/menu entry.
  },
};

export default plugin;
