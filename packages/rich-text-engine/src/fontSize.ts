// core.editor.rich-text-engine (Desing architecture §5/§8.1) — the
// `FontSize` TipTap extension backing `core.format.font-size` (NTA-58).
//
// TipTap ships no official font-size extension (unlike Bold/Italic/Heading
// from StarterKit, or Color from `@tiptap/extension-color`), so this is a
// small custom `Extension` following TipTap's own documented recipe: add
// a `fontSize` attribute to the existing `textStyle` mark (the same mark
// `@tiptap/extension-color`'s `Color` layers its `color` attribute onto,
// already in `createBaseExtensions()` below) rather than inventing a new
// mark, plus `setFontSize`/`unsetFontSize` chain commands that set/clear
// it — mirroring `Color`'s own `setColor`/`unsetColor` shape exactly.
//
// Lives in this package, not in plugins/format-font-size, for the same
// reason `TextStyle`/`Color` (core.format.font-color's mark) live in
// richTextEditor.ts already: `plugins/element-text-segment/src/
// SegmentLayer.tsx` mounts `RichTextEngineProvider` with no `extensions`
// prop, so there is currently no live wiring point for a plugin to layer
// its own TipTap extension into a *mounted* segment editor — only
// `createBaseExtensions()` reaches every real segment. Adding a new
// cross-plugin extension-injection mechanism is out of scope for this
// ticket (no other plugin needs it yet); see plugins/format-font-size/
// src/index.ts's own header comment for the fuller tradeoff.
import { Extension } from "@tiptap/core";

export interface FontSizeOptions {
  /** Mark types this extension's `fontSize` attribute applies to. @default ["textStyle"] */
  types: string[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      /** Sets the `textStyle` mark's `fontSize` attribute (e.g. "16px") on the current selection. */
      setFontSize: (fontSize: string) => ReturnType;
      /** Clears the `fontSize` attribute, falling back to the segment's inherited/default size. */
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Extension.create<FontSizeOptions>({
  name: "fontSize",

  addOptions() {
    return { types: ["textStyle"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).run(),
    };
  },
});
