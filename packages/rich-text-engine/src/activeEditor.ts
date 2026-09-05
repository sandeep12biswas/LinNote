// The "last-focused" TipTap editor instance (NTA-42), shared across
// every `RichTextEngineProvider` in the app (there's one per segment,
// docs/architecture.md §7) — a `plugins/format-*` command (bold,
// italic, headers, ...) runs against whichever editor this currently
// points to, so a Format-menu click can still act on the segment the
// user was just editing even though clicking the menu itself blurs that
// segment's `contentEditable` before the click's command dispatch runs.
// This works because TipTap/ProseMirror retains its own selection model
// independently of DOM focus — `.chain().focus().toggleX().run()`
// against the tracked editor re-focuses it and operates on whatever was
// selected, rather than needing the DOM selection to have survived.
//
// Deliberately "last focused", not "currently focused": `setActiveEditor`
// is only ever called on focus (see `RichTextEngineProvider.tsx`), never
// on blur — clearing on blur would lose the reference the instant a
// Format-menu click's own mousedown blurs the segment, before the click
// (and the command it dispatches) even fires. The only thing that clears
// it is `clearActiveEditorIfCurrent`, called when an editor is destroyed
// (its segment removed/unmounted), so a stale reference to a
// no-longer-existing editor can't linger and get acted on.
//
// Lives here, not in apps/desktop or plugins/element-text-segment: every
// `plugins/format-*` package and the segment renderer both already
// depend on this package explicitly (per this package's own `index.ts`
// header comment), so it's the one place both sides can share this
// without a new cross-package dependency.

import type { Editor } from "@tiptap/core";

let lastFocusedEditor: Editor | null = null;

/** The editor a `plugins/format-*` command should act on — `null` if nothing has ever been focused, or the last-focused one has since been destroyed. */
export function getActiveEditor(): Editor | null {
  return lastFocusedEditor;
}

/** Called by `RichTextEngineProvider` on every `onFocus`. */
export function setActiveEditor(editor: Editor | null): void {
  lastFocusedEditor = editor;
}

/** Called by `RichTextEngineProvider` when an editor is destroyed — a no-op if some *other* (more recently focused) editor is the tracked one, so an out-of-order unmount can't wipe out a still-valid reference. */
export function clearActiveEditorIfCurrent(editor: Editor): void {
  if (lastFocusedEditor === editor) lastFocusedEditor = null;
}
