import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// File Attachment — core.element.file-attachment
// docx/xlsx/txt/md/etc. attachments; double-click opens in the OS-default app via Tauri's shell/opener plugin. Hosts the fileHandlers extension point for type-specific previews layered on top, without modifying this plugin (Desing architecture §10.1).
// TODO(phase-7): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.element.file-attachment",
    name: "File Attachment",
    version: "0.1.0",
    contributes: {
      canvasElementTypes: [
      // TODO: register this element type's renderer with canvas-core.
    ],
    },
  },
  activate(_ctx: PluginContext) {
    // TODO(phase-7): register the contribution(s) above with the
    // registry via ctx, and wire up any toolbar/menu entry.
  },
};

export default plugin;
