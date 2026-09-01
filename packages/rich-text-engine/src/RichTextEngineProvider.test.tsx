import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Extension, type Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
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
});
