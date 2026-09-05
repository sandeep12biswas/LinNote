import type { Plugin, PluginContext } from "@linnote/plugin-sdk";
import { INSERT_YOUTUBE_EMBED_COMMAND } from "./YouTubeEmbedLayer";

// YouTube Embed — core.element.youtube-embed
// Inline (sandboxed youtube-nocookie.com iframe) vs. external (system browser via shell.open) playback, chosen once at insert time (Desing architecture §10.2).
//
// NTA-63 implements the renderer (inline iframe / external thumbnail);
// NTA-64 adds the insert-time "Play here" vs "Open in browser" prompt —
// both in ./YouTubeEmbedLayer.tsx (its own header comment covers the
// app-side mounting contract, apps/desktop/src/canvas-core/
// YouTubeEmbedHost.tsx, mirroring plugins/element-text-segment/src/
// index.ts's and plugins/element-file-attachment/src/index.ts's own
// header comments).
//
// `INSERT_YOUTUBE_EMBED_COMMAND`'s *real* behavior (arming the dialog —
// this plugin structurally can't add the created element to the open
// page itself) is installed by YouTubeEmbedHost.tsx once a page is open,
// overwriting the console.log fallback registered here at activate()
// time — same shared `ctx.commands`/`CommandBus` table either side can
// register against (registry/createContext.ts's own header comment).
export const plugin: Plugin = {
  manifest: {
    id: "core.element.youtube-embed",
    name: "YouTube Embed",
    version: "0.1.0",
    contributes: {
      canvasElementTypes: [{ type: "youtube-embed" }],
      menu: [{ menu: "Edit", label: "Insert YouTube Video", commandId: INSERT_YOUTUBE_EMBED_COMMAND, priority: 21 }],
      toolbar: [{ label: "Insert YouTube", commandId: INSERT_YOUTUBE_EMBED_COMMAND, priority: 21 }],
    },
  },
  activate(ctx: PluginContext) {
    ctx.canvas.registerElementType({ type: "youtube-embed" });
    ctx.commands.register(INSERT_YOUTUBE_EMBED_COMMAND, () => {
      console.log(
        `[core.element.youtube-embed] "${INSERT_YOUTUBE_EMBED_COMMAND}" run (no canvas mounted yet — real behavior is installed by canvas-core/YouTubeEmbedHost.tsx once a page is open)`,
      );
    });
  },
};

export default plugin;

export {
  INSERT_YOUTUBE_EMBED_COMMAND,
  DEFAULT_EMBED_WIDTH,
  DEFAULT_EMBED_HEIGHT,
  extractYouTubeVideoId,
  nextZIndex,
  YouTubeEmbedLayer,
  type YouTubeEmbedData,
  type YouTubeEmbedLayerProps,
} from "./YouTubeEmbedLayer";
