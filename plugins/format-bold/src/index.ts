import type { Plugin, PluginContext } from "@linnote/plugin-sdk";
import { getActiveEditor } from "@linnote/rich-text-engine";

// Bold — core.format.bold
// Wraps TipTap's Bold mark; no dependency on any other core.format.* plugin (Desing architecture §8.2).
//
// NTA-15 (integration) declared the Format-menu entry and registered a
// no-op command for it, proving the registry/shell/plugin wiring works
// end-to-end. NTA-42 replaces that no-op with the real thing: toggles
// TipTap's Bold mark on whichever segment editor was last focused
// (`@linnote/rich-text-engine`'s `getActiveEditor()` — see that
// package's `activeEditor.ts` for why a command, which isn't a React
// component, needs a tracker like this rather than reading
// `useRichTextEditor()` itself).
const APPLY_BOLD_COMMAND = "core.format.bold.apply";

export const plugin: Plugin = {
  manifest: {
    id: "core.format.bold",
    name: "Bold",
    version: "0.1.0",
    contributes: {
      menu: [{ menu: "Format", label: "Bold", commandId: APPLY_BOLD_COMMAND, priority: 10 }],
      formatCommands: [
      // TODO: register this plugin's command(s) against @linnote/rich-text-engine.
      ],
    },
  },
  activate(ctx: PluginContext) {
    ctx.commands.register(APPLY_BOLD_COMMAND, () => {
      // No-op if nothing's been focused yet (or the last-focused segment
      // was since removed) — same "don't crash the dispatcher" spirit as
      // registry/createContext.ts's CommandBus itself.
      getActiveEditor()?.chain().focus().toggleBold().run();
    });
  },
};

export default plugin;
