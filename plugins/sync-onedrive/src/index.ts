import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// OneDrive Sync — core.sync.onedrive
// Microsoft Graph API, OAuth2 device/browser flow, tokens in the OS keychain via Tauri. Implements the shared SyncProvider interface (Desing architecture §16).
// TODO(phase-10): implement. See docs/architecture.md for the
// authoritative design (mirrors the Notion "Desing architecture" page).
export const plugin: Plugin = {
  manifest: {
    id: "core.sync.onedrive",
    name: "OneDrive Sync",
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
