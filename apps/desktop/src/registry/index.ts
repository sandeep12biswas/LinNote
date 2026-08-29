// Plugin registry — docs/architecture.md §3.2. The architectural center
// of the app: the shell's menu/toolbar, the canvas's formatting commands
// and element types, and the sync layer's providers are all consumers of
// the same plugin contract (@linnote/plugin-sdk), not special-cased
// subsystems.
//
// TODO(phase-1):
// - On startup, read every known plugin's manifest (built-ins from
//   plugins/*, user-installed ones later from an app-data plugins folder),
//   topologically sort by `dependencies`, call activate() in order.
// - Enable/disable as a persisted user setting (../persistence/); disabling
//   calls deactivate() and removes its contributed UI.
// - Isolated failure handling: catch activate() throwing, mark that plugin
//   `failed`, continue activating the rest.
// - Surface plugin state in a Settings > Plugins panel (itself
//   plugin-contributed via `settingsPanels`).

import type { Plugin } from "@linnote/plugin-sdk";

export type PluginState = "active" | "disabled" | "failed";

export interface RegisteredPlugin {
  plugin: Plugin;
  state: PluginState;
}
