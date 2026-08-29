import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Headers — core.format.headers
// 3 header block levels (H1-H3) via TipTap StarterKit's Heading node (Desing architecture §8.2).
// TODO(phase-4): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.format.headers",
    name: "Headers",
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
