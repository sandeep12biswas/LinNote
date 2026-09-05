import type { Plugin, PluginContext } from "@linnote/plugin-sdk";
import { INSERT_FILE_ATTACHMENT_COMMAND } from "./FileAttachmentLayer";

// File Attachment — core.element.file-attachment
// docx/xlsx/txt/md/etc. attachments; double-click opens in the OS-default app via Tauri's shell/opener plugin. Hosts the fileHandlers extension point for type-specific previews layered on top, without modifying this plugin (Desing architecture §10.1).
//
// NTA-62 implements the renderer + "open externally" — see
// ./FileAttachmentLayer.tsx for the component itself and its own header
// comment for the app-side mounting contract
// (apps/desktop/src/canvas-core/FileAttachmentHost.tsx, not the
// `canvasElementTypes` contribution below — see
// @linnote/plugin-sdk's own TODO on `CanvasElementTypeContribution`,
// same as plugins/element-text-segment/src/index.ts's header comment).
//
// `INSERT_FILE_ATTACHMENT_COMMAND`'s *real* behavior (picking a file via
// `@tauri-apps/plugin-dialog` and adding the element to the open page,
// which this plugin structurally can't do — see
// FileAttachmentLayer.tsx's header comment) is installed by
// FileAttachmentHost.tsx once a page is open, overwriting the
// console.log fallback registered here at activate() time — same shared
// `ctx.commands`/`CommandBus` table either side can register against
// (registry/createContext.ts's own header comment already documents it
// that way).
export const plugin: Plugin = {
  manifest: {
    id: "core.element.file-attachment",
    name: "File Attachment",
    version: "0.1.0",
    contributes: {
      canvasElementTypes: [{ type: "file-attachment" }],
      menu: [{ menu: "Edit", label: "Insert File Attachment", commandId: INSERT_FILE_ATTACHMENT_COMMAND, priority: 20 }],
      toolbar: [{ label: "Insert File", commandId: INSERT_FILE_ATTACHMENT_COMMAND, priority: 20 }],
    },
  },
  activate(ctx: PluginContext) {
    ctx.canvas.registerElementType({ type: "file-attachment" });
    ctx.commands.register(INSERT_FILE_ATTACHMENT_COMMAND, () => {
      console.log(
        `[core.element.file-attachment] "${INSERT_FILE_ATTACHMENT_COMMAND}" run (no canvas mounted yet — real behavior is installed by canvas-core/FileAttachmentHost.tsx once a page is open)`,
      );
    });
  },
};

export default plugin;

export {
  INSERT_FILE_ATTACHMENT_COMMAND,
  DEFAULT_ATTACHMENT_WIDTH,
  DEFAULT_ATTACHMENT_HEIGHT,
  basenameFromPath,
  extensionFromFileName,
  nextZIndex,
  FileAttachmentLayer,
  type FileAttachmentData,
  type FileAttachmentLayerProps,
} from "./FileAttachmentLayer";
