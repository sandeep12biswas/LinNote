import { describe, expect, it } from "vitest";
import type { Plugin, PluginManifest } from "@linnote/plugin-sdk";
import { resolveActivationOrder } from "./index";

function makePlugin(id: string, dependencies?: Record<string, string>): Plugin {
  const manifest: PluginManifest = {
    id,
    name: id,
    version: "0.1.0",
    dependencies,
    contributes: {},
  };
  return { manifest, activate: () => {} };
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
