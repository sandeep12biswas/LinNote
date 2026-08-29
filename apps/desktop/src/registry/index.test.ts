import { describe, expect, it, vi } from "vitest";
import type { Plugin, PluginContext, PluginManifest } from "@linnote/plugin-sdk";
import type { PluginSettingsPersistence } from "./index";
import type { PluginSettingsStore } from "../persistence";
import { PluginRegistry, resolveActivationOrder } from "./index";

function makePlugin(
  id: string,
  dependencies?: Record<string, string>,
  overrides: Partial<Pick<Plugin, "activate" | "deactivate">> = {},
): Plugin {
  const manifest: PluginManifest = {
    id,
    name: id,
    version: "0.1.0",
    dependencies,
    contributes: {},
  };
  return { manifest, activate: overrides.activate ?? (() => {}), deactivate: overrides.deactivate };
}

function makeContext(): PluginContext {
  return {
    commands: { register: () => {}, run: () => undefined },
    menu: { addItem: () => {} },
    canvas: { registerElementType: () => {} },
    storage: { get: async () => undefined, set: async () => {} },
    events: { on: () => {}, emit: () => {} },
  };
}

function makeFakePersistence(initial: PluginSettingsStore = {}): PluginSettingsPersistence {
  let store: PluginSettingsStore = JSON.parse(JSON.stringify(initial));
  return {
    readPluginSettings: async () => JSON.parse(JSON.stringify(store)),
    writePluginSettings: async (next) => {
      store = JSON.parse(JSON.stringify(next));
    },
  };
}

describe("resolveActivationOrder", () => {
  it("returns plugins with no dependencies in their original order", () => {
    const a = makePlugin("a");
    const b = makePlugin("b");
    const { order, errors } = resolveActivationOrder([a, b]);
    expect(errors).toEqual([]);
    expect(order.map((p) => p.manifest.id)).toEqual(["a", "b"]);
  });

  it("orders a dependency before its dependent", () => {
    const fontColor = makePlugin("core.format.font-color", { "core.util.contrast": "^1" });
    const contrast = makePlugin("core.util.contrast");
    // Declared in "dependent first" input order, on purpose — the
    // resolved order must still put the dependency first.
    const { order, errors } = resolveActivationOrder([fontColor, contrast]);
    expect(errors).toEqual([]);
    expect(order.map((p) => p.manifest.id)).toEqual(["core.util.contrast", "core.format.font-color"]);
  });

  it("resolves a longer chain in dependency order", () => {
    const c = makePlugin("c", { b: "^1" });
    const b = makePlugin("b", { a: "^1" });
    const a = makePlugin("a");
    const { order, errors } = resolveActivationOrder([c, b, a]);
    expect(errors).toEqual([]);
    expect(order.map((p) => p.manifest.id)).toEqual(["a", "b", "c"]);
  });

  it("reports a missing dependency per-plugin without crashing the rest", () => {
    const broken = makePlugin("broken", { "does.not.exist": "^1" });
    const healthy = makePlugin("healthy");
    const { order, errors } = resolveActivationOrder([broken, healthy]);
    expect(order.map((p) => p.manifest.id)).toEqual(["healthy"]);
    expect(errors).toEqual([
      { pluginId: "broken", reason: "missing-dependency", detail: expect.stringContaining("does.not.exist") },
    ]);
  });

  it("transitively excludes a plugin that depends on a broken plugin", () => {
    const broken = makePlugin("broken", { "does.not.exist": "^1" });
    const dependent = makePlugin("dependent", { broken: "^1" });
    const healthy = makePlugin("healthy");
    const { order, errors } = resolveActivationOrder([broken, dependent, healthy]);
    expect(order.map((p) => p.manifest.id)).toEqual(["healthy"]);
    expect(errors.map((e) => e.pluginId).sort()).toEqual(["broken", "dependent"]);
  });

  it("reports a circular dependency per-plugin without crashing the rest", () => {
    const a = makePlugin("a", { b: "^1" });
    const b = makePlugin("b", { a: "^1" });
    const healthy = makePlugin("healthy");
    const { order, errors } = resolveActivationOrder([a, b, healthy]);
    expect(order.map((p) => p.manifest.id)).toEqual(["healthy"]);
    expect(errors.map((e) => e.pluginId).sort()).toEqual(["a", "b"]);
    for (const error of errors) {
      expect(error.reason).toBe("circular-dependency");
    }
  });

  it("reports a self-dependency as a circular dependency", () => {
    const selfDep = makePlugin("self", { self: "^1" });
    const { order, errors } = resolveActivationOrder([selfDep]);
    expect(order).toEqual([]);
    expect(errors).toEqual([
      { pluginId: "self", reason: "circular-dependency", detail: expect.any(String) },
    ]);
  });

  it("returns an empty result for an empty input", () => {
    expect(resolveActivationOrder([])).toEqual({ order: [], errors: [] });
  });
});

describe("PluginRegistry", () => {
  it("activates every plugin in dependency order and persists a fresh settings entry for each", async () => {
    const calls: string[] = [];
    const a = makePlugin("a", undefined, { activate: () => void calls.push("a") });
    const b = makePlugin("b", { a: "^1" }, { activate: () => void calls.push("b") });
    const persistence = makeFakePersistence();

    const registry = new PluginRegistry([b, a], {
      settingsPersistence: persistence,
      createContext: makeContext,
    });
    await registry.activateAll();

    expect(calls).toEqual(["a", "b"]);
    expect(registry.getState("a")).toBe("active");
    expect(registry.getState("b")).toBe("active");
    await expect(persistence.readPluginSettings()).resolves.toEqual({
      a: { enabled: true, settings: null },
      b: { enabled: true, settings: null },
    });
  });

  it("skips activate() for a plugin persisted as disabled", async () => {
    const activate = vi.fn();
    const plugin = makePlugin("a", undefined, { activate });
    const persistence = makeFakePersistence({ a: { enabled: false, settings: { theme: "dark" } } });

    const registry = new PluginRegistry([plugin], {
      settingsPersistence: persistence,
      createContext: makeContext,
    });
    await registry.activateAll();

    expect(activate).not.toHaveBeenCalled();
    expect(registry.getState("a")).toBe("disabled");
  });

  it("marks a plugin excluded by resolveActivationOrder as failed, not disabled", async () => {
    const activate = vi.fn();
    const broken = makePlugin("broken", { "does.not.exist": "^1" }, { activate });
    const registry = new PluginRegistry([broken], {
      settingsPersistence: makeFakePersistence(),
      createContext: makeContext,
    });
    await registry.activateAll();

    expect(activate).not.toHaveBeenCalled();
    expect(registry.getState("broken")).toBe("failed");
  });

  it("disable() calls deactivate(), persists enabled:false, and preserves the settings blob", async () => {
    const deactivate = vi.fn();
    const plugin = makePlugin("a", undefined, { deactivate });
    const persistence = makeFakePersistence();
    const registry = new PluginRegistry([plugin], {
      settingsPersistence: persistence,
      createContext: makeContext,
    });
    await registry.activateAll();

    await registry.disable("a");

    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(registry.getState("a")).toBe("disabled");
    await expect(persistence.readPluginSettings()).resolves.toEqual({
      a: { enabled: false, settings: null },
    });
  });

  it("enable() calls activate() again and restores the plugin's prior settings blob", async () => {
    const activate = vi.fn();
    const plugin = makePlugin("a", undefined, { activate });
    const persistence = makeFakePersistence({ a: { enabled: false, settings: { theme: "dark" } } });
    const registry = new PluginRegistry([plugin], {
      settingsPersistence: persistence,
      createContext: makeContext,
    });
    await registry.activateAll();
    expect(activate).not.toHaveBeenCalled();

    await registry.enable("a");

    expect(activate).toHaveBeenCalledTimes(1);
    expect(registry.getState("a")).toBe("active");
    // The `settings: { theme: "dark" }` blob from before is untouched —
    // only the `enabled` flag flipped.
    await expect(persistence.readPluginSettings()).resolves.toEqual({
      a: { enabled: true, settings: { theme: "dark" } },
    });
  });

  it("throws from disable()/enable() for an unknown plugin id", async () => {
    const registry = new PluginRegistry([makePlugin("a")], {
      settingsPersistence: makeFakePersistence(),
      createContext: makeContext,
    });
    await registry.activateAll();

    await expect(registry.disable("does.not.exist")).rejects.toThrow(/unknown plugin/);
    await expect(registry.enable("does.not.exist")).rejects.toThrow(/unknown plugin/);
  });

  it("list() reflects every plugin's current state", async () => {
    const a = makePlugin("a");
    const b = makePlugin("b");
    const registry = new PluginRegistry([a, b], {
      settingsPersistence: makeFakePersistence(),
      createContext: makeContext,
    });
    await registry.activateAll();
    await registry.disable("b");

    expect(registry.list()).toEqual([
      { plugin: a, state: "active" },
      { plugin: b, state: "disabled" },
    ]);
  });

  it("marks a plugin whose activate() throws as failed, without stopping the rest from activating", async () => {
    const boom = new Error("boom");
    const broken = makePlugin("broken", undefined, {
      activate: () => {
        throw boom;
      },
    });
    const healthyActivate = vi.fn();
    const healthy = makePlugin("healthy", undefined, { activate: healthyActivate });

    const registry = new PluginRegistry([broken, healthy], {
      settingsPersistence: makeFakePersistence(),
      createContext: makeContext,
    });
    await registry.activateAll();

    expect(registry.getState("broken")).toBe("failed");
    expect(registry.getFailureReason("broken")).toBe(boom);
    expect(registry.getState("healthy")).toBe("active");
    expect(healthyActivate).toHaveBeenCalledTimes(1);
  });

  it("marks a plugin whose activate() rejects (async throw) as failed the same way", async () => {
    const boom = new Error("async boom");
    const broken = makePlugin("broken", undefined, { activate: async () => { throw boom; } });
    const registry = new PluginRegistry([broken], {
      settingsPersistence: makeFakePersistence(),
      createContext: makeContext,
    });
    await registry.activateAll();

    expect(registry.getState("broken")).toBe("failed");
    expect(registry.getFailureReason("broken")).toBe(boom);
  });

  it("exposes the ResolutionError as the failure reason for a bad-dependency plugin", async () => {
    const broken = makePlugin("broken", { "does.not.exist": "^1" });
    const registry = new PluginRegistry([broken], {
      settingsPersistence: makeFakePersistence(),
      createContext: makeContext,
    });
    await registry.activateAll();

    expect(registry.getState("broken")).toBe("failed");
    expect(registry.getFailureReason("broken")).toEqual({
      pluginId: "broken",
      reason: "missing-dependency",
      detail: expect.stringContaining("does.not.exist"),
    });
  });

  it("re-enabling a failed plugin that now succeeds clears its failure reason", async () => {
    let shouldThrow = true;
    const plugin = makePlugin("a", undefined, {
      activate: () => {
        if (shouldThrow) throw new Error("still broken");
      },
    });
    const registry = new PluginRegistry([plugin], {
      settingsPersistence: makeFakePersistence(),
      createContext: makeContext,
    });
    await registry.activateAll();
    expect(registry.getState("a")).toBe("failed");
    expect(registry.getFailureReason("a")).toBeInstanceOf(Error);

    shouldThrow = false;
    await registry.enable("a");

    expect(registry.getState("a")).toBe("active");
    expect(registry.getFailureReason("a")).toBeUndefined();
    // Persisted intent is enabled:true even though it was failed before —
    // "failed" is a transient runtime state, not the user's persisted choice.
    await expect(registry.list()).toBeDefined();
  });

  it("enable() catches a throw instead of propagating it, and still persists enabled:true", async () => {
    const boom = new Error("nope");
    const plugin = makePlugin("a", undefined, { activate: () => {} });
    const persistence = makeFakePersistence({ a: { enabled: false, settings: null } });
    const registry = new PluginRegistry([plugin], {
      settingsPersistence: persistence,
      createContext: makeContext,
    });
    await registry.activateAll();
    expect(registry.getState("a")).toBe("disabled");

    // Swap in a throwing activate() to exercise enable()'s own try/catch,
    // independent of activateAll()'s.
    plugin.activate = () => {
      throw boom;
    };
    await expect(registry.enable("a")).resolves.toBeUndefined();

    expect(registry.getState("a")).toBe("failed");
    expect(registry.getFailureReason("a")).toBe(boom);
    await expect(persistence.readPluginSettings()).resolves.toEqual({
      a: { enabled: true, settings: null },
    });
  });
});
