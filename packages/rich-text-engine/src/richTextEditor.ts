// core.editor.rich-text-engine (Desing architecture §5/§8.1) — the base
// TipTap extension list and a plain, non-React factory for constructing a
// TipTap Editor from it. No JSX here on purpose (see index.ts) so this
// module can be imported by anything, React or not.

import { Editor, type AnyExtension, type EditorOptions, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { FontSize } from "./fontSize";

/**
 * A segment's persisted rich-text content — `SegmentBlock.content` in
 * apps/desktop/src/types/index.ts ("RichTextDoc, produced by
 * @linnote/rich-text-engine, §8"). This is TipTap's own JSON document
 * format (`JSONContent`): the natural, no-translation serialization for
 * content that round-trips through createRichTextEditor() /
 * RichTextEngineProvider via `editor.getJSON()` / the `content` option.
 */
export type RichTextDoc = JSONContent;

/**
 * The shared base extension list every segment's editor is built from
 * (Desing architecture §5): StarterKit (paragraphs, headings, lists,
 * bold, italic, history, ...) plus the extensions that don't ship their
 * own `plugins/format-*` wrapper but that several format plugins need a
 * common home for — text-style + color (`core.format.font-color`),
 * font-size (`core.format.font-size`, NTA-58 — see ./fontSize.ts for why
 * it lives here rather than in that plugin package), text-align
 * (`core.format.alignment`), task-list/task-item
 * (`core.format.checkbox-list`).
 *
 * Returns a fresh array on every call — TipTap extension instances are
 * configured per-Editor, so two editors (e.g. two open segments) must
 * not share the same extension instances.
 */
export function createBaseExtensions(): AnyExtension[] {
  return [
    StarterKit,
    TextStyle,
    Color,
    FontSize,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ];
}

export interface CreateRichTextEditorOptions extends Partial<Omit<EditorOptions, "extensions">> {
  /**
   * Extensions layered on top of createBaseExtensions() — this is how a
   * `plugins/format-*` package (bold, italic, headers, ...) adds its own
   * mark/node, or a consumer overrides one of the base extensions'
   * options, without constructing a second, competing TipTap Editor.
   */
  extensions?: AnyExtension[];
}

/**
 * Builds one TipTap `Editor` from the shared base extension list plus
 * whatever `extensions` the caller layers on. This is the one place a
 * `plugins/format-*` package or the (not-yet-built) SegmentBlock renderer
 * should construct a TipTap Editor from — formatting plugins then act on
 * the *same* returned instance (`editor.chain().focus().toggleBold().run()`
 * etc.) rather than instantiating their own.
 *
 * Headless by default: no `element` is required, so this also works
 * outside a mounted DOM node (tests, non-visual doc manipulation). React
 * consumers will normally prefer `RichTextEngineProvider` /
 * `useRichTextEditor()` instead of calling this directly, since those
 * also handle the extension list + lifecycle via `@tiptap/react`.
 */
export function createRichTextEditor(options: CreateRichTextEditorOptions = {}): Editor {
  const { extensions = [], ...rest } = options;
  return new Editor({
    ...rest,
    extensions: [...createBaseExtensions(), ...extensions],
  });
}
