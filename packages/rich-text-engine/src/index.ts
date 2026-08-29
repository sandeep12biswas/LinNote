// core.editor.rich-text-engine (Desing architecture §8.1): a thin,
// shared wrapper around TipTap/ProseMirror. Formatting plugins
// (plugins/format-*) depend on this package explicitly and register their
// mark/node through it — they never construct their own TipTap instance.
//
// TODO(phase-4): export a `createRichTextEditor()` factory (StarterKit +
// the base extension list) and a `RichTextEngineProvider` React context so
// plugins/format-* can compose their own TipTap extensions in without each
// one re-instantiating the editor.
// TODO(phase-4): renders inside the same absolutely-positioned overlay as
// SegmentBlock (Desing architecture §7) — the DOM mounting contract with
// canvas-core (apps/desktop/src/canvas-core/) still needs to be defined.

export type { Editor as TipTapEditor } from "@tiptap/core";
