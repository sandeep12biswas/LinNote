import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Italic — core.format.italic
// Wraps TipTap's Italic mark; no dependency on any other core.format.* plugin (Desing architecture §8.2).
// TODO(phase-4): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.format.italic",
    name: "Italic",
    version: "0.1.0",
    contributes: {
      formatCommands: [
      // TODO: register this plugin's command(s) against @linnote/rich-text-engine.
    ],
    },
  },
  activate(_ctx: PluginContext) {
    // TODO(phase-4): register the contribution(s) above with the
    // registry via ctx, and wire up any toolbar/menu entry.
  },
};

export default plugin;
