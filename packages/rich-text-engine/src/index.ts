// core.editor.rich-text-engine (Desing architecture §8.1): a thin,
// shared wrapper around TipTap/ProseMirror. Formatting plugins
// (plugins/format-*) depend on this package explicitly and register their
// mark/node through it — they never construct their own TipTap instance.
//
// createRichTextEditor() (richTextEditor.ts) is the plain, non-React
// factory: StarterKit + the base extension list, with a way to layer
// extra extensions in. RichTextEngineProvider (RichTextEngineProvider.tsx)
// is the React side of the same thing — it builds one editor from that
// same base list and hands it out via context so plugins/format-* can
// compose their own TipTap extensions in without each one
// re-instantiating the editor.
//
// The DOM mounting contract with canvas-core
// (apps/desktop/src/canvas-core/) — rendering inside the same
// absolutely-positioned overlay as SegmentBlock (Desing architecture §7)
// — is deliberately left to the SegmentBlock renderer
// (plugins/element-text-segment, NTA-37/38), not this package.
//
// activeEditor.ts (NTA-42): the "last focused editor" a `plugins/format-*`
// command runs against — see that file's own header comment.

export type { Editor as TipTapEditor } from "@tiptap/core";

// Re-exported so a segment renderer (plugins/element-text-segment) can
// mount the shared editor's DOM node without adding its own raw
// `@tiptap/react` dependency — this package stays the one place that
// knows about TipTap, per this file's own header comment.
export { EditorContent } from "@tiptap/react";

export {
  createBaseExtensions,
  createRichTextEditor,
  type CreateRichTextEditorOptions,
  type RichTextDoc,
} from "./richTextEditor";

export {
  RichTextEngineProvider,
  useRichTextEngine,
  useRichTextEditor,
  type RichTextEngineContextValue,
  type RichTextEngineProviderProps,
} from "./RichTextEngineProvider";

export { clearActiveEditorIfCurrent, getActiveEditor, setActiveEditor } from "./activeEditor";
