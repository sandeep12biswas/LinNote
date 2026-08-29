import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@linnote/plugin-sdk";
import { plugin } from "./index";

function makeContext(): PluginContext & { registered: Map<string, (...args: unknown[]) => unknown> } {
  const registered = new Map<string, (...args: unknown[]) => unknown>();
  return {
    registered,
    commands: {
      register: (id, fn) => registered.set(id, fn),
      run: (id, ...args) => registered.get(id)?.(...args),
    },
    menu: { addItem: vi.fn() },
    canvas: { registerElementType: vi.fn() },
    storage: { get: async () => undefined, set: async () => {} },
    events: { on: vi.fn(), emit: vi.fn() },
  };
}

describe("core.format.bold", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.format.bold");
  });

  it("declares a Format-menu entry pointing at its own command id (NTA-15 integration example)", () => {
    expect(plugin.manifest.contributes.menu).toEqual([
      { menu: "Format", label: "Bold", commandId: "core.format.bold.apply", priority: 10 },
    ]);
  });

  it("activate() registers the menu entry's command id as a no-op, without throwing", () => {
    const ctx = makeContext();
    expect(() => plugin.activate(ctx)).not.toThrow();
    expect(ctx.registered.has("core.format.bold.apply")).toBe(true);
    expect(() => ctx.registered.get("core.format.bold.apply")?.()).not.toThrow();
  });
});
