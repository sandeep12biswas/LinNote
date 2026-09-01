import { Extension } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createRichTextEditor, type RichTextDoc } from "./index";

// Stands in for a plugins/format-* package's own TipTap extension.
const ProbeExtension = Extension.create({ name: "probe-extension" });

describe("createRichTextEditor", () => {
  it("builds a working editor with the base extension list loaded", () => {
    const editor = createRichTextEditor();

    expect(editor.isEditable).toBe(true);
    // StarterKit's paragraph/doc/text nodes:
    expect(editor.schema.nodes.paragraph).toBeDefined();
    expect(editor.schema.nodes.heading).toBeDefined();
    expect(editor.schema.nodes.bulletList).toBeDefined();
    // StarterKit's bold/italic marks, wrapped later by plugins/format-bold
    // and plugins/format-italic:
    expect(editor.schema.marks.bold).toBeDefined();
    expect(editor.schema.marks.italic).toBeDefined();
    // The extensions declared alongside StarterKit for
    // core.format.font-color / core.format.alignment / core.format.checkbox-list:
    expect(editor.schema.marks.textStyle).toBeDefined();
    expect(editor.schema.marks.textStyle.spec.attrs).toHaveProperty("color");
    expect(editor.schema.nodes.taskList).toBeDefined();
    expect(editor.schema.nodes.taskItem).toBeDefined();
    expect(editor.extensionManager.extensions.some((ext) => ext.name === "textAlign")).toBe(true);

    editor.destroy();
  });

  it("layers extra extensions on top of the base list, for a format plugin's own extension", () => {
    const editor = createRichTextEditor({
      extensions: [ProbeExtension],
    });

    expect(editor.extensionManager.extensions.some((ext) => ext.name === "probe-extension")).toBe(
      true,
    );
    // Base extensions are still present alongside it:
    expect(editor.schema.nodes.paragraph).toBeDefined();

    editor.destroy();
  });

  it("round-trips content through set/get as TipTap's own JSON doc format", () => {
    const initialDoc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello LinNote" }],
        },
      ],
    };

    const editor = createRichTextEditor({ content: initialDoc });

    // toMatchObject rather than toEqual: TextAlign (part of the base
    // extension list) stamps a `textAlign` attr onto paragraph/heading
    // nodes, so the round-tripped doc is a superset of what was set.
    expect(editor.getJSON()).toMatchObject(initialDoc);
    expect(editor.getText()).toBe("Hello LinNote");

    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Edited" }],
        },
      ],
    });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Edited" }],
        },
      ],
    });

    editor.destroy();
  });

  it("starts from an empty doc when no content is given", () => {
    const editor = createRichTextEditor();

    expect(editor.isEmpty).toBe(true);
    expect(editor.getText()).toBe("");

    editor.destroy();
  });
});
