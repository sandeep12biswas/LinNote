import type { Plugin, PluginContext } from "@linnote/plugin-sdk";
import { getActiveEditor } from "@linnote/rich-text-engine";

// Font Size — core.format.font-size
// Text size mark, independent of font-color (Desing architecture §8.2) —
// no dependency on core.format.font-color; each plugin layers its own
// attribute onto the shared `textStyle` mark from
// @linnote/rich-text-engine, but registers its own commands separately
// (NTA-57's own header comment: "an explicit dependency, NOT a dependency
// on format-font-size").
//
// TipTap ships no official font-size extension (unlike Bold/Italic from
// StarterKit, or Color from `@tiptap/extension-color`) — the `FontSize`
// TipTap `Extension` itself (adds a `fontSize` attribute to the
// `textStyle` mark, plus `setFontSize`/`unsetFontSize` chain commands)
// therefore lives in `packages/rich-text-engine/src/fontSize.ts`, not
// here: `plugins/element-text-segment/src/SegmentLayer.tsx` mounts
// `RichTextEngineProvider` with no `extensions` prop, so there is
// currently no live wiring point for a plugin to layer its own extension
// into a *mounted* segment editor (only `createBaseExtensions()` reaches
// every real segment). Building that plumbing is out of scope for this
// ticket — no other plugin needs it yet — so this follows the same
// pragmatic precedent `core.format.font-color`'s `color` attribute set:
// added directly to `createBaseExtensions()` alongside `TextStyle`/
// `Color`. A human may prefer the more "pure" per-plugin
// extension-injection route later; flagging that tradeoff here.
//
// No popover/rich-input system exists anywhere in this app yet (same
// constraint `core.format.font-color`'s own header comment notes), so —
// following `core.format.headers`'s `submenu` pattern exactly — this
// exposes five preset entries grouped under one `submenu: "Font Size"`
// rather than a free-input control: four fixed sizes plus a "Default"
// entry that clears the mark back to the segment's inherited size.
const APPLY_SMALL_COMMAND = "core.format.fontSize.applySmall";
const APPLY_NORMAL_COMMAND = "core.format.fontSize.applyNormal";
const APPLY_LARGE_COMMAND = "core.format.fontSize.applyLarge";
const APPLY_HUGE_COMMAND = "core.format.fontSize.applyHuge";
const APPLY_DEFAULT_COMMAND = "core.format.fontSize.applyDefault";

/** Preset point sizes (Desing architecture §8.2 leaves the exact scale to this ticket). */
export const FONT_SIZE_SMALL = "12px";
export const FONT_SIZE_NORMAL = "16px";
export const FONT_SIZE_LARGE = "20px";
export const FONT_SIZE_HUGE = "28px";

function applyFontSize(size: string): void {
  getActiveEditor()?.chain().focus().setFontSize(size).run();
}

function applyDefaultFontSize(): void {
  getActiveEditor()?.chain().focus().unsetFontSize().run();
}

export const plugin: Plugin = {
  manifest: {
    id: "core.format.font-size",
    name: "Font Size",
    version: "0.1.0",
    contributes: {
      menu: [
        { menu: "Format", label: "Small", commandId: APPLY_SMALL_COMMAND, submenu: "Font Size", priority: 40 },
        { menu: "Format", label: "Normal", commandId: APPLY_NORMAL_COMMAND, submenu: "Font Size", priority: 41 },
        { menu: "Format", label: "Large", commandId: APPLY_LARGE_COMMAND, submenu: "Font Size", priority: 42 },
        { menu: "Format", label: "Huge", commandId: APPLY_HUGE_COMMAND, submenu: "Font Size", priority: 43 },
        { menu: "Format", label: "Default", commandId: APPLY_DEFAULT_COMMAND, submenu: "Font Size", priority: 44 },
      ],
      formatCommands: [
      // TODO: register this plugin's command(s) against @linnote/rich-text-engine.
    ],
    },
  },
  activate(ctx: PluginContext) {
    ctx.commands.register(APPLY_SMALL_COMMAND, () => applyFontSize(FONT_SIZE_SMALL));
    ctx.commands.register(APPLY_NORMAL_COMMAND, () => applyFontSize(FONT_SIZE_NORMAL));
    ctx.commands.register(APPLY_LARGE_COMMAND, () => applyFontSize(FONT_SIZE_LARGE));
    ctx.commands.register(APPLY_HUGE_COMMAND, () => applyFontSize(FONT_SIZE_HUGE));
    ctx.commands.register(APPLY_DEFAULT_COMMAND, () => applyDefaultFontSize());
  },
};

export default plugin;
