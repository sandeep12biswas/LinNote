// Plugin registry — docs/architecture.md §1.2 (mirrors the Notion "Desing
// architecture" page's §3.2). The architectural center of the app: the
// shell's menu/toolbar, the canvas's formatting commands and element
// types, and the sync layer's providers are all consumers of the same
// plugin contract (@linnote/plugin-sdk), not special-cased subsystems.
//
// This file implements NTA-8 (manifest discovery & dependency-sorted
// activation order — a pure function) and NTA-9 (activate()/deactivate()
// lifecycle + persisted enable/disable, below). Wiring the real
// plugins/* packages in at app startup is NTA-16 (integration).
//
// TODO(phase-1, NTA-10): isolated activate()-throwing failure handling
// (distinct from the dependency-resolution errors above, which are
// detected before any activate() call happens) + Settings > Plugins panel.

import type { Plugin, PluginContext, PluginId } from "@linnote/plugin-sdk";
import type { PersistenceProvider, PluginSettingsStore } from "../persistence";

export type PluginState = "active" | "disabled" | "failed";

export interface RegisteredPlugin {
  plugin: Plugin;
  state: PluginState;
}

export type ResolutionErrorReason = "missing-dependency" | "circular-dependency";

export interface ResolutionError {
  pluginId: PluginId;
  reason: ResolutionErrorReason;
  /** Human-readable detail — which dependency, and why it couldn't be resolved. */
  detail: string;
}

export interface ActivationOrderResult {
  /**
   * Plugins in a valid dependency-respecting activation order (each
   * plugin's dependencies appear before it). Excludes every plugin
   * reported in `errors` — a plugin with an unresolvable dependency
   * graph, direct or transitive, never appears here.
   */
  order: Plugin[];
  /**
   * Per-plugin problems that kept a plugin out of `order`. The
   * resolution as a whole never throws — one plugin's bad dependency
   * declaration doesn't prevent the rest of the set from getting a
   * valid order, mirroring the isolated-failure philosophy of §1.2
   * one step earlier in the pipeline (before any activate() call).
   */
  errors: ResolutionError[];
}

/**
 * Given a set of plugins, topologically sorts them by
 * `manifest.dependencies` (pluginId -> semver range — the range itself
 * isn't checked here, only that the dependency id is present and
 * resolvable) to produce a valid activation order.
 *
 * A missing dependency (an id not present in `plugins` at all) or a
 * circular dependency (directly or transitively) is reported per-plugin
 * in `errors` rather than thrown — every other, unaffected plugin still
 * gets a valid position in `order`.
 */
export function resolveActivationOrder(plugins: Plugin[]): ActivationOrderResult {
  const byId = new Map<PluginId, Plugin>(plugins.map((p) => [p.manifest.id, p]));
  const errors: ResolutionError[] = [];
  const excluded = new Set<PluginId>();

  // Directly missing dependencies, then transitively exclude anything that
  // depends (even indirectly) on an already-excluded plugin, to a fixpoint.
  let changed = true;
  while (changed) {
    changed = false;
    for (const plugin of plugins) {
      const id = plugin.manifest.id;
      if (excluded.has(id)) continue;

      for (const depId of Object.keys(plugin.manifest.dependencies ?? {})) {
        if (!byId.has(depId)) {
          errors.push({
            pluginId: id,
            reason: "missing-dependency",
            detail: `depends on "${depId}", which is not among the given plugins`,
          });
          excluded.add(id);
          changed = true;
          break;
        }
        if (excluded.has(depId)) {
          errors.push({
            pluginId: id,
            reason: "missing-dependency",
            detail: `depends on "${depId}", which could not be resolved`,
          });
          excluded.add(id);
          changed = true;
          break;
        }
      }
    }
  }

  // Kahn's algorithm over the remaining plugins — every dependency of a
  // non-excluded plugin is guaranteed (by the fixpoint above) to also be
  // non-excluded, so edges only ever point within this remaining set.
  const remaining = plugins.filter((p) => !excluded.has(p.manifest.id));
  const inDegree = new Map<PluginId, number>();
  const dependents = new Map<PluginId, PluginId[]>();
  for (const plugin of remaining) {
    const id = plugin.manifest.id;
    const deps = Object.keys(plugin.manifest.dependencies ?? {});
    inDegree.set(id, deps.length);
    for (const depId of deps) {
      const list = dependents.get(depId) ?? [];
      list.push(id);
      dependents.set(depId, list);
    }
  }

  const order: Plugin[] = [];
  const queue: PluginId[] = remaining
    .filter((p) => inDegree.get(p.manifest.id) === 0)
    .map((p) => p.manifest.id);

  while (queue.length > 0) {
    const id = queue.shift() as PluginId;
    const plugin = byId.get(id);
    if (plugin) order.push(plugin);
    for (const dependentId of dependents.get(id) ?? []) {
      const next = (inDegree.get(dependentId) ?? 0) - 1;
      inDegree.set(dependentId, next);
      if (next === 0) queue.push(dependentId);
    }
  }

  // Anything left with a nonzero in-degree never had its dependencies
  // fully satisfied by the queue — it's part of a cycle.
  for (const plugin of remaining) {
    const id = plugin.manifest.id;
    if ((inDegree.get(id) ?? 0) > 0) {
      errors.push({
        pluginId: id,
        reason: "circular-dependency",
        detail: "part of a dependency cycle among: " + Object.keys(plugin.manifest.dependencies ?? {}).join(", "),
      });
    }
  }

  return { order, errors };
}

/**
 * The registry only ever needs to read/write the plugin-settings blob,
 * never the tree/page/asset methods — accepting this narrower slice of
 * `PersistenceProvider` means a test double only has to implement two
 * methods, and lets the real `FileSystemPersistenceProvider` (NTA-14,
 * not built yet) be swapped in later without this file changing at all.
 */
export type PluginSettingsPersistence = Pick<PersistenceProvider, "readPluginSettings" | "writePluginSettings">;

export interface PluginRegistryOptions {
  /** Where enable/disable state (and each plugin's own settings) is persisted. */
  settingsPersistence: PluginSettingsPersistence;
  /**
   * Builds the `PluginContext` handed to activate()/deactivate() for
   * one plugin. What that context actually does (ctx.commands,
   * ctx.menu, ...) is out of scope here — the shell/canvas-core work
   * that backs it lands in other subtasks (NTA-11, NTA-12).
   */
  createContext: (pluginId: PluginId) => PluginContext;
}

/**
 * Owns plugin lifecycle: activation in dependency order (NTA-8's
 * `resolveActivationOrder`), and persisted enable/disable (NTA-9). One
 * instance per app session; `activateAll()` is expected to run once at
 * startup before `disable`/`enable` are called.
 */
export class PluginRegistry {
  private readonly byId = new Map<PluginId, Plugin>();
  private readonly states = new Map<PluginId, PluginState>();
  private settings: PluginSettingsStore = {};

  constructor(
    private readonly plugins: Plugin[],
    private readonly options: PluginRegistryOptions,
  ) {
    for (const plugin of plugins) this.byId.set(plugin.manifest.id, plugin);
  }

  /**
   * Loads persisted settings, marks every plugin `resolveActivationOrder`
   * excluded as `failed` (a bad dependency graph, not a user's disable
   * choice), then calls `activate()` on the rest in dependency order —
   * skipping any whose persisted `enabled` flag is explicitly `false`.
   * A plugin new to this run (no persisted entry yet) defaults to
   * enabled and gets a fresh settings entry written back, so it's there
   * for a future `disable()`/`enable()` call to flip.
   *
   * Note: `activate()` is not wrapped in try/catch here — a throwing
   * plugin currently propagates. Isolated failure handling for that
   * case is NTA-10, not this subtask.
   */
  async activateAll(): Promise<void> {
    this.settings = await this.options.settingsPersistence.readPluginSettings();

    const { order, errors } = resolveActivationOrder(this.plugins);
    for (const error of errors) {
      this.states.set(error.pluginId, "failed");
    }

    for (const plugin of order) {
      const id = plugin.manifest.id;
      const enabled = this.settings[id]?.enabled ?? true;
      if (!(id in this.settings)) {
        this.settings[id] = { enabled: true, settings: null };
      }
      if (enabled) {
        await plugin.activate(this.options.createContext(id));
        this.states.set(id, "active");
      } else {
        this.states.set(id, "disabled");
      }
    }

    await this.options.settingsPersistence.writePluginSettings(this.settings);
  }

  /**
   * Calls `deactivate()` (if the plugin defines one) and persists
   * `enabled: false`. The plugin's own `settings` blob is left
   * untouched — re-enabling restores it, per NTA-9's acceptance
   * criteria — only the `enabled` flag changes.
   */
  async disable(pluginId: PluginId): Promise<void> {
    const plugin = this.requirePlugin(pluginId);
    await plugin.deactivate?.(this.options.createContext(pluginId));
    this.states.set(pluginId, "disabled");
    this.settings[pluginId] = { ...(this.settings[pluginId] ?? { settings: null }), enabled: false };
    await this.options.settingsPersistence.writePluginSettings(this.settings);
  }

  /**
   * Calls `activate()` and persists `enabled: true`. Whatever
   * `settings` blob the plugin had before being disabled is passed
   * through unchanged.
   */
  async enable(pluginId: PluginId): Promise<void> {
    const plugin = this.requirePlugin(pluginId);
    await plugin.activate(this.options.createContext(pluginId));
    this.states.set(pluginId, "active");
    this.settings[pluginId] = { ...(this.settings[pluginId] ?? { settings: null }), enabled: true };
    await this.options.settingsPersistence.writePluginSettings(this.settings);
  }

  getState(pluginId: PluginId): PluginState | undefined {
    return this.states.get(pluginId);
  }

  list(): RegisteredPlugin[] {
    return this.plugins.map((plugin) => ({
      plugin,
      state: this.states.get(plugin.manifest.id) ?? "disabled",
    }));
  }

  private requirePlugin(pluginId: PluginId): Plugin {
    const plugin = this.byId.get(pluginId);
    if (!plugin) throw new Error(`PluginRegistry: unknown plugin id "${pluginId}"`);
    return plugin;
  }
}
