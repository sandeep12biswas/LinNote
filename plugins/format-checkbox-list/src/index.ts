import type { Plugin, PluginContext } from "@linnote/plugin-sdk";
import { getActiveEditor } from "@linnote/rich-text-engine";

// Checkbox List — core.format.checkbox-list
// Checkable to-do list node via TipTap's TaskList/TaskItem extensions
// (already part of @linnote/rich-text-engine's createBaseExtensions(),
// Desing architecture §8.2) — no dependency on any other core.format.*
// plugin.
//
// Same shape as core.format.bold (NTA-42): toggles the TaskList node on
// whichever segment editor was last focused
// (`@linnote/rich-text-engine`'s `getActiveEditor()` — see that
// package's `activeEditor.ts` for why a command, which isn't a React
// component, needs a tracker like this rather than reading
// `useRichTextEditor()` itself).
const APPLY_CHECKBOX_LIST_COMMAND = "core.format.checkbox-list.apply";

export const plugin: Plugin = {
  manifest: {
    id: "core.format.checkbox-list",
    name: "Checkbox List",
    version: "0.1.0",
    contributes: {
      menu: [
        {
          menu: "Format",
          label: "Checkbox List",
          commandId: APPLY_CHECKBOX_LIST_COMMAND,
          priority: 45,
        },
      ],
      formatCommands: [
      // TODO: register this plugin's command(s) against @linnote/rich-text-engine.
      ],
    },
  },
  activate(ctx: PluginContext) {
    ctx.commands.register(APPLY_CHECKBOX_LIST_COMMAND, () => {
      // No-op if nothing's been focused yet (or the last-focused segment
      // was since removed) — same "don't crash the dispatcher" spirit as
      // registry/createContext.ts's CommandBus itself.
      getActiveEditor()?.chain().focus().toggleTaskList().run();
    });
  },
};

export default plugin;
