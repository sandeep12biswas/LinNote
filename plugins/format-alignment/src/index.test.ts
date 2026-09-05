import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@linnote/plugin-sdk";
import { getActiveEditor } from "@linnote/rich-text-engine";
import { plugin } from "./index";

vi.mock("@linnote/rich-text-engine", () => ({ getActiveEditor: vi.fn() }));

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

/** A fluent chain mock standing in for `Editor.chain()` — records each call (with `setTextAlign`'s argument) in order. */
function makeChainMock() {
  const calls: unknown[] = [];
  const chain = {
    focus: vi.fn(() => {
      calls.push("focus");
      return chain;
    }),
    setTextAlign: vi.fn((align: string) => {
      calls.push(["setTextAlign", align]);
      return chain;
    }),
    run: vi.fn(() => {
      calls.push("run");
    }),
  };
  return { chain, calls };
}

describe("core.format.alignment", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.format.alignment");
  });

  it("declares four Format-menu entries (Left/Center/Right/Justify) grouped under one Alignment submenu", () => {
    expect(plugin.manifest.contributes.menu).toEqual([
      { menu: "Format", label: "Left", commandId: "core.format.alignment.applyLeft", submenu: "Alignment", priority: 50 },
      { menu: "Format", label: "Center", commandId: "core.format.alignment.applyCenter", submenu: "Alignment", priority: 51 },
      { menu: "Format", label: "Right", commandId: "core.format.alignment.applyRight", submenu: "Alignment", priority: 52 },
      { menu: "Format", label: "Justify", commandId: "core.format.alignment.applyJustify", submenu: "Alignment", priority: 53 },
    ]);
  });

  it.each([
    ["core.format.alignment.applyLeft", "left"],
    ["core.format.alignment.applyCenter", "center"],
    ["core.format.alignment.applyRight", "right"],
    ["core.format.alignment.applyJustify", "justify"],
  ] as const)("%s sets text align %s on the currently active editor", (commandId, align) => {
    const { chain, calls } = makeChainMock();
    vi.mocked(getActiveEditor).mockReturnValue({ chain: () => chain } as never);
    const ctx = makeContext();

    plugin.activate(ctx);
    ctx.registered.get(commandId)?.();

    expect(calls).toEqual(["focus", ["setTextAlign", align], "run"]);
  });

  it("does nothing (doesn't throw) when no editor is currently active", () => {
    vi.mocked(getActiveEditor).mockReturnValue(null);
    const ctx = makeContext();

    plugin.activate(ctx);

    expect(() => ctx.registered.get("core.format.alignment.applyCenter")?.()).not.toThrow();
  });
});
