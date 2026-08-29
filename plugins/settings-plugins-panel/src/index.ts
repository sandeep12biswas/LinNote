import type { Plugin, PluginContext } from "@linnote/plugin-sdk";

// Settings > Plugins panel — core.settings.plugins
// The Settings > Plugins panel from NTA-10 (docs/architecture.md §1.2,
// §1.4 "built-in features are plugins too"): lists every plugin's
// active/disabled/failed state (apps/desktop/src/registry/'s
// PluginRegistry.list()/getState()/getFailureReason(), NTA-8/9/10) and
// lets the user enable/disable one.
//
// This plugin only declares the `settingsPanels` contribution — it does
// not render anything yet. There is no Settings UI shell in this
// codebase to render into (per @linnote/plugin-sdk's own
// SettingsPanelContribution comment: "render function, once the
// Settings UI shell exists"), and building one isn't in scope for any
// ticket so far. When that shell exists, it reads plugin state directly
// from the registry; this plugin doesn't need to change to support that.
export const plugin: Plugin = {
  manifest: {
    id: "core.settings.plugins",
    name: "Plugins",
    version: "0.1.0",
    contributes: {
      settingsPanels: [{ id: "plugins", label: "Plugins" }],
    },
  },
  activate(_ctx: PluginContext) {
    // No-op: the contribution above is declarative (read from the
    // manifest by whatever renders the Settings UI, once it exists) —
    // there's nothing to register imperatively via ctx yet.
  },
};

export default plugin;
