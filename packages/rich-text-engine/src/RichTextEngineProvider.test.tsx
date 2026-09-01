import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Extension, type Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getActiveEditor, setActiveEditor } from "./activeEditor";
import type { RichTextDoc } from "./richTextEditor";
import { RichTextEngineProvider, useRichTextEditor } from "./RichTextEngineProvider";

/** Plain mutable holder — plays the role of a ref for reading the editor
 * a Probe component saw, back out in the test body. */
function makeEditorHolder(): { editor: Editor | null } {
  return { editor: null };
}

// Stands in for a plugins/format-* package's own TipTap extension.
const ProbeExtension = Extension.create({ name: "probe-extension" });

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  setActiveEditor(null); // isolate NTA-42's active-editor tracker between tests — it's module-level state
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

function mount(children: ReactNode): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(children));
}

describe("RichTextEngineProvider", () => {
  it("makes one shared editor instance available to descendants via useRichTextEditor()", () => {
    const seen: unknown[] = [];

    function Probe() {
      seen.push(useRichTextEditor());
      return null;
    }

    mount(
      <RichTextEngineProvider>
        <Probe />
      </RichTextEngineProvider>,
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBeNull();
  });

  it("loads the given content into the editor and reports edits back via onChange as a RichTextDoc", () => {
    const initialDoc: RichTextDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Start" }] }],
    };
    const changes: RichTextDoc[] = [];
    const holder = makeEditorHolder();

    function Probe() {
      holder.editor = useRichTextEditor();
      return null;
    }

    mount(
      <RichTextEngineProvider content={initialDoc} onChange={(doc) => changes.push(doc)}>
        <Probe />
      </RichTextEngineProvider>,
    );

    const editor = holder.editor;
    expect(editor).not.toBeNull();
    expect(editor?.getText()).toBe("Start");

    act(() => {
      // Insert just before the paragraph's closing token (content.size - 1),
      // i.e. append inline to "Start" rather than after the paragraph
      // (which would start a new one).
      editor!.commands.insertContentAt(editor!.state.doc.content.size - 1, "!");
    });

    expect(changes.length).toBeGreaterThan(0);
    const lastChange = changes[changes.length - 1];
    expect(lastChange.content?.[0]).toMatchObject({
      content: [{ type: "text", text: "Start!" }],
    });
  });

  it("layers a caller-supplied extension in without replacing the base list", () => {
    const holder = makeEditorHolder();

    function Probe() {
      holder.editor = useRichTextEditor();
      return null;
    }

    mount(
      <RichTextEngineProvider extensions={[ProbeExtension]}>
        <Probe />
      </RichTextEngineProvider>,
    );

    const names = holder.editor?.extensionManager.extensions.map((ext) => ext.name) ?? [];
    expect(names).toContain("probe-extension");
    expect(names).toContain("starterKit");
  });

  // `editor.commands.focus()` alone doesn't dispatch a real DOM focus
  // event (TipTap's `onFocus` fires off the ProseMirror view's actual
  // DOM node) — these two tests render `EditorContent` (this package's
  // own re-export) themselves and focus the resulting `.ProseMirror`
  // node directly, the same DOM path a real segment's `SegmentEditor`
  // (plugins/element-text-segment) exercises.

  it("becomes the active editor (NTA-42) once focused", () => {
    function Probe() {
      const editor = useRichTextEditor();
      return <EditorContent editor={editor} />;
    }

    mount(
      <RichTextEngineProvider>
        <Probe />
      </RichTextEngineProvider>,
    );
    expect(getActiveEditor()).toBeNull(); // not yet focused

    const proseMirror = container!.querySelector(".ProseMirror") as HTMLElement;
    act(() => proseMirror.focus());

    expect(getActiveEditor()).not.toBeNull();
  });

  it("clears the active-editor tracker on unmount only if it's still the tracked one", () => {
    function ProbeA() {
      const editor = useRichTextEditor();
      return <EditorContent editor={editor} />;
    }
    function ProbeB() {
      const editor = useRichTextEditor();
      return <EditorContent editor={editor} />;
    }

    let containerA: HTMLDivElement | null = document.createElement("div");
    document.body.appendChild(containerA);
    let rootA: Root | null = createRoot(containerA);
    act(() =>
      rootA!.render(
        <RichTextEngineProvider>
          <ProbeA />
        </RichTextEngineProvider>,
      ),
    );

    mount(
      <RichTextEngineProvider>
        <ProbeB />
      </RichTextEngineProvider>,
    ); // this test's own `container`/`root`, cleaned up by the top-level afterEach

    act(() => (containerA!.querySelector(".ProseMirror") as HTMLElement).focus());
    const activeAfterA = getActiveEditor();
    act(() => (container!.querySelector(".ProseMirror") as HTMLElement).focus()); // B is now the active editor, not A
    const activeAfterB = getActiveEditor();
    expect(activeAfterB).not.toBe(activeAfterA); // sanity: focusing B actually changed the tracked editor

    act(() => rootA!.unmount()); // A unmounts — should NOT clear B's tracked reference
    containerA.remove();
    containerA = null;
    rootA = null;

    expect(getActiveEditor()).toBe(activeAfterB);
  });
});
