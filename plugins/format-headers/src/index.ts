import type { Plugin, PluginContext } from "@linnote/plugin-sdk";
import { getActiveEditor } from "@linnote/rich-text-engine";

// Headers — core.format.headers
// 3 header block levels (H1-H3) via TipTap StarterKit's Heading node (Desing architecture §8.2).
//
// NTA-42: declares three Format-menu entries — not one, since a heading
// needs a level — grouped under one `submenu: "Headers"` (buildMenuBar/
// MenuBar.tsx, ../../apps/desktop/src/shell/, already support this
// nesting; this is just the first plugin to actually use it). Each
// toggles TipTap's Heading node at its own level on whichever segment
// editor was last focused — see `@linnote/rich-text-engine`'s
// `activeEditor.ts` for why. `toggleHeading` (not `setHeading`) means
// clicking the *current* level's entry again turns it back into a plain
// paragraph, matching how Bold/Italic already toggle.
const APPLY_H1_COMMAND = "core.format.headers.applyH1";
const APPLY_H2_COMMAND = "core.format.headers.applyH2";
const APPLY_H3_COMMAND = "core.format.headers.applyH3";

function toggleHeadingLevel(level: 1 | 2 | 3): void {
  getActiveEditor()?.chain().focus().toggleHeading({ level }).run();
}

export const plugin: Plugin = {
  manifest: {
    id: "core.format.headers",
    name: "Headers",
    version: "0.1.0",
    contributes: {
      menu: [
        { menu: "Format", label: "Heading 1", commandId: APPLY_H1_COMMAND, submenu: "Headers", priority: 30 },
        { menu: "Format", label: "Heading 2", commandId: APPLY_H2_COMMAND, submenu: "Headers", priority: 31 },
        { menu: "Format", label: "Heading 3", commandId: APPLY_H3_COMMAND, submenu: "Headers", priority: 32 },
      ],
      formatCommands: [
      // TODO: register this plugin's command(s) against @linnote/rich-text-engine.
    ],
    },
  },
  activate(ctx: PluginContext) {
    ctx.commands.register(APPLY_H1_COMMAND, () => toggleHeadingLevel(1));
    ctx.commands.register(APPLY_H2_COMMAND, () => toggleHeadingLevel(2));
    ctx.commands.register(APPLY_H3_COMMAND, () => toggleHeadingLevel(3));
  },
};

export default plugin;
