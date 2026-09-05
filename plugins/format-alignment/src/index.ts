import type { Plugin, PluginContext } from "@linnote/plugin-sdk";
import { getActiveEditor } from "@linnote/rich-text-engine";

// Alignment — core.format.alignment
// Paragraph/segment alignment via TipTap's TextAlign extension — already
// configured in `@linnote/rich-text-engine`'s `createBaseExtensions()` for
// "heading" and "paragraph" (Desing architecture §8.2). This plugin is
// pure wiring: no new extension, just Format-menu entries that call
// `setTextAlign` on whichever segment editor was last focused — see
// `@linnote/rich-text-engine`'s `activeEditor.ts` for why.
//
// NTA-42: four Format-menu entries grouped under one `submenu: "Alignment"`,
// mirroring core.format.headers's H1-H3 submenu shape. `setTextAlign` (not
// a toggle) matches TextAlign's own semantics — there's no "off" alignment
// to toggle back to, just switching which of the four is active.
//
// Scope note: the ticket description also mentions the page header's own
// align field (Desing architecture §6) — that's `PageHeader.tsx` (NTA-34),
// which already has independent, working left/center/right buttons wired
// directly to the page store. Refactoring it to reuse this TipTap-based
// segment-content plugin is out of scope here; left untouched.
const APPLY_LEFT_COMMAND = "core.format.alignment.applyLeft";
const APPLY_CENTER_COMMAND = "core.format.alignment.applyCenter";
const APPLY_RIGHT_COMMAND = "core.format.alignment.applyRight";
const APPLY_JUSTIFY_COMMAND = "core.format.alignment.applyJustify";

function applyAlignment(align: "left" | "center" | "right" | "justify"): void {
  getActiveEditor()?.chain().focus().setTextAlign(align).run();
}

export const plugin: Plugin = {
  manifest: {
    id: "core.format.alignment",
    name: "Alignment",
    version: "0.1.0",
    contributes: {
      menu: [
        { menu: "Format", label: "Left", commandId: APPLY_LEFT_COMMAND, submenu: "Alignment", priority: 50 },
        { menu: "Format", label: "Center", commandId: APPLY_CENTER_COMMAND, submenu: "Alignment", priority: 51 },
        { menu: "Format", label: "Right", commandId: APPLY_RIGHT_COMMAND, submenu: "Alignment", priority: 52 },
        { menu: "Format", label: "Justify", commandId: APPLY_JUSTIFY_COMMAND, submenu: "Alignment", priority: 53 },
      ],
      formatCommands: [
      // TODO: register this plugin's command(s) against @linnote/rich-text-engine.
    ],
    },
  },
  activate(ctx: PluginContext) {
    ctx.commands.register(APPLY_LEFT_COMMAND, () => applyAlignment("left"));
    ctx.commands.register(APPLY_CENTER_COMMAND, () => applyAlignment("center"));
    ctx.commands.register(APPLY_RIGHT_COMMAND, () => applyAlignment("right"));
    ctx.commands.register(APPLY_JUSTIFY_COMMAND, () => applyAlignment("justify"));
  },
};

export default plugin;
