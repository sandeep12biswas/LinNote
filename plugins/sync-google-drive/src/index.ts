import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Google Drive Sync — core.sync.google-drive
// Google Drive API v3, equivalent OAuth2 flow and keychain storage. Implements the shared SyncProvider interface (Desing architecture §16).
// TODO(phase-10): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.sync.google-drive",
    name: "Google Drive Sync",
    version: "0.1.0",
    contributes: {
      syncProviders: [
      // TODO: register this provider, implementing Desing architecture §16's SyncProvider interface.
    ],
    },
  },
  activate(_ctx: PluginContext) {
    // TODO(phase-10): register the contribution(s) above with the
    // registry via ctx, and wire up any toolbar/menu entry.
  },
};

export default plugin;
