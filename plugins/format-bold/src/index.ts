import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Bold — core.format.bold
// Wraps TipTap's Bold mark; no dependency on any other core.format.* plugin (Desing architecture §8.2).
// TODO(phase-4): implement real Bold-mark toggling against
// @linnote/rich-text-engine. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
//
// NTA-15 (integration): declares a stub Format-menu entry and registers a
// no-op command for it — the story's acceptance criteria needs one real,
// clickable end-to-end example (menu building -> command dispatch) to
// prove the registry/shell/plugin wiring works together, and explicitly
// allows a no-op stub here since real formatting logic is Phase 4/5.
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
    // TODO(phase-4): replace this no-op with real Bold-mark toggling once
    // the canvas/editor surface exists.
    ctx.commands.register(APPLY_BOLD_COMMAND, () => {
      console.log(`[core.format.bold] "${APPLY_BOLD_COMMAND}" run (no-op stub — NTA-15 integration)`);
    });
  },
};

export default plugin;
