// core.editor.rich-text-engine (Desing architecture §5/§8.1) — the React
// side of the shared TipTap wrapper. Composes the base extension list
// (richTextEditor.ts) with whatever a caller layers on via `extensions`,
// builds exactly one `@tiptap/react` editor instance for it, and hands
// that instance out through context so plugins/format-* can register
// their mark/node and act on it without each one re-instantiating the
// editor (the TODO this ticket replaces).
//
// Deliberately doesn't render `<EditorContent editor={editor} />` itself:
// where/how a segment mounts that DOM node — inside the same
// absolutely-positioned overlay as SegmentBlock, per Desing architecture
// §7 — is canvas-core's mounting contract, not this package's concern
// (see docs/architecture.md §4: "Segment mechanics ... and text
// formatting ... are independent concerns with no dependency between
// them"). The SegmentBlock renderer (plugins/element-text-segment,
// NTA-37/38) reads `editor` via `useRichTextEditor()` and renders
// `EditorContent` itself.
//
// NTA-42: also reports focus/destroy to ./activeEditor.ts's "last
// focused editor" tracker — see that file's own header comment for why
// a `plugins/format-*` command needs it rather than just reading
// `useRichTextEditor()` itself (a command isn't a React component, it
// has no props/context to read from).

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { Editor, AnyExtension } from "@tiptap/core";
import { useEditor } from "@tiptap/react";
import { clearActiveEditorIfCurrent, setActiveEditor } from "./activeEditor";
import { createBaseExtensions, type RichTextDoc } from "./richTextEditor";

export interface RichTextEngineContextValue {
  /** The shared editor instance, or null before first mount / after teardown. */
  editor: Editor | null;
}

const RichTextEngineContext = createContext<RichTextEngineContextValue>({ editor: null });

export interface RichTextEngineProviderProps {
  /** A segment's persisted content, or undefined to start from an empty doc. */
  content?: RichTextDoc;
  /** @default true */
  editable?: boolean;
  /**
   * Extensions layered on top of createBaseExtensions() — how a
   * `plugins/format-*` package composes its own TipTap extension in.
   */
  extensions?: AnyExtension[];
  /**
   * Called with the editor's current doc (`editor.getJSON()`) on every
   * change, so the caller can persist it back onto the owning
   * SegmentBlock's `content`.
   */
  onChange?: (doc: RichTextDoc) => void;
  children: ReactNode;
}

/**
 * Mounts one TipTap editor and exposes it via context. Wrap a segment's
 * content with this once; every format command and the segment's own
 * `EditorContent` read the same editor instance through
 * `useRichTextEditor()` / `useRichTextEngine()`.
 */
export function RichTextEngineProvider({
  content,
  editable = true,
  extensions,
  onChange,
  children,
}: RichTextEngineProviderProps) {
  // Fresh extension instances per mount (see createBaseExtensions), but
  // stable across re-renders of this component as long as the caller's
  // `extensions` array identity is stable.
  const allExtensions = useMemo(
    () => [...createBaseExtensions(), ...(extensions ?? [])],
    [extensions],
  );

  const editor = useEditor({
    extensions: allExtensions,
    content: content ?? null,
    editable,
    immediatelyRender: true,
    onUpdate: ({ editor: updated }) => onChange?.(updated.getJSON()),
    onFocus: ({ editor: focused }) => setActiveEditor(focused),
  });

  // Guards against a destroyed editor lingering as the tracked "last
  // focused" one (see ./activeEditor.ts) — e.g. a segment removed while
  // it was still the most recently focused.
  useEffect(() => {
    if (!editor) return;
    return () => clearActiveEditorIfCurrent(editor);
  }, [editor]);

  const value = useMemo<RichTextEngineContextValue>(() => ({ editor }), [editor]);

  return (
    <RichTextEngineContext.Provider value={value}>{children}</RichTextEngineContext.Provider>
  );
}

/** The full context value — `{ editor }` — for consumers that want the null-check explicit. */
export function useRichTextEngine(): RichTextEngineContextValue {
  return useContext(RichTextEngineContext);
}

/** Convenience over useRichTextEngine() for the common case of just wanting the editor. */
export function useRichTextEditor(): Editor | null {
  return useRichTextEngine().editor;
}
