import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Template Plugin — core.namespace.plugin-id
// Copy this folder (Plugins §8: `pnpm create-plugin <name>`), rename the id/name below, and fill in `contributes` + `activate()`.
// TODO(phase-N): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.namespace.plugin-id",
    name: "Template Plugin",
    version: "0.1.0",
    contributes: {
      formatCommands: [
      // TODO: register this plugin's command(s) against @linnote/rich-text-engine.
    ],
    },
  },
  activate(_ctx: PluginContext) {
    // TODO(phase-N): register the contribution(s) above with the
    // registry via ctx, and wire up any toolbar/menu entry.
  },
};

export default plugin;
