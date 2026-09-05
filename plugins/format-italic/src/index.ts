import type { Plugin, PluginContext } from "@linnote/plugin-sdk";
import { getActiveEditor } from "@linnote/rich-text-engine";

// Italic — core.format.italic
// Wraps TipTap's Italic mark; no dependency on any other core.format.* plugin (Desing architecture §8.2).
//
// NTA-42: declares the Format-menu entry and registers the real command
// directly — unlike bold/italic's original NTA-15/NTA-17 split, there
// was no separate no-op-stub-first step actually wired for this plugin
// (its manifest had no `menu` contribution and an empty `activate()`
// despite NTA-18 being marked Done in Jira; flagged, not silently
// "fixed" as if nothing changed). Toggles TipTap's Italic mark on
// whichever segment editor was last focused — see
// `@linnote/rich-text-engine`'s `activeEditor.ts` for why.
const APPLY_ITALIC_COMMAND = "core.format.italic.apply";

export const plugin: Plugin = {
  manifest: {
    id: "core.format.italic",
    name: "Italic",
    version: "0.1.0",
    contributes: {
      menu: [{ menu: "Format", label: "Italic", commandId: APPLY_ITALIC_COMMAND, priority: 20 }],
      formatCommands: [
      // TODO: register this plugin's command(s) against @linnote/rich-text-engine.
    ],
    },
  },
  activate(ctx: PluginContext) {
    ctx.commands.register(APPLY_ITALIC_COMMAND, () => {
      getActiveEditor()?.chain().focus().toggleItalic().run();
    });
  },
};

export default plugin;
