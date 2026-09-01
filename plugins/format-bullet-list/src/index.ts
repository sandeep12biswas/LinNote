import type { Plugin, PluginContext } from "@linnote/plugin-sdk";
import { getActiveEditor } from "@linnote/rich-text-engine";

// Bullet List — core.format.bullet-list
// Toggles TipTap StarterKit's BulletList/ListItem (bundled by default — no
// extra extension needed); no dependency on any other core.format.*
// plugin (Desing architecture §8.2).
//
// Same shape as core.format.bold/italic (NTA-42): toggles the list on
// whichever segment editor was last focused via `@linnote/rich-text-engine`'s
// `getActiveEditor()` tracker.
const APPLY_BULLET_LIST_COMMAND = "core.format.bullet-list.apply";

export const plugin: Plugin = {
  manifest: {
    id: "core.format.bullet-list",
    name: "Bullet List",
    version: "0.1.0",
    contributes: {
      menu: [{ menu: "Format", label: "Bullet List", commandId: APPLY_BULLET_LIST_COMMAND, priority: 25 }],
      formatCommands: [
      // TODO: register this plugin's command(s) against @linnote/rich-text-engine.
      ],
    },
  },
  activate(ctx: PluginContext) {
    ctx.commands.register(APPLY_BULLET_LIST_COMMAND, () => {
      // No-op if nothing's been focused yet (or the last-focused segment
      // was since removed) — same "don't crash the dispatcher" spirit as
      // registry/createContext.ts's CommandBus itself.
      getActiveEditor()?.chain().focus().toggleBulletList().run();
    });
  },
};

export default plugin;
