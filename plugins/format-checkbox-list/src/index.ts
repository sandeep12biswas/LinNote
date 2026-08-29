import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Checkbox List — core.format.checkbox-list
// Checkable to-do list node via TipTap's TaskList/TaskItem extensions (Desing architecture §8.2).
// TODO(phase-5): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.format.checkbox-list",
    name: "Checkbox List",
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
