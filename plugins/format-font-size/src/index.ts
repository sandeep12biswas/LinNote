import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Font Size — core.format.font-size
// Text size mark, independent of font-color (Desing architecture §8.2). TipTap has no official font-size extension — TODO: implement as a custom TextStyle-based mark.
// TODO(phase-5): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.format.font-size",
    name: "Font Size",
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
