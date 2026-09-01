import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@linnote/plugin-sdk";
import { getActiveEditor } from "@linnote/rich-text-engine";
import { FONT_SIZE_HUGE, FONT_SIZE_LARGE, FONT_SIZE_NORMAL, FONT_SIZE_SMALL, plugin } from "./index";

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

/** A fluent chain mock standing in for `Editor.chain()` — records each call (with `setFontSize`'s argument) in order. */
function makeChainMock() {
  const calls: unknown[] = [];
  const chain = {
    focus: vi.fn(() => {
      calls.push("focus");
      return chain;
    }),
    setFontSize: vi.fn((size: string) => {
      calls.push(["setFontSize", size]);
      return chain;
    }),
    unsetFontSize: vi.fn(() => {
      calls.push("unsetFontSize");
      return chain;
    }),
    run: vi.fn(() => {
      calls.push("run");
    }),
  };
  return { chain, calls };
}

describe("core.format.font-size", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.format.font-size");
  });

  it("declares five Format-menu entries (4 presets + Default) grouped under one Font Size submenu", () => {
    expect(plugin.manifest.contributes.menu).toEqual([
      { menu: "Format", label: "Small", commandId: "core.format.fontSize.applySmall", submenu: "Font Size", priority: 40 },
      { menu: "Format", label: "Normal", commandId: "core.format.fontSize.applyNormal", submenu: "Font Size", priority: 41 },
      { menu: "Format", label: "Large", commandId: "core.format.fontSize.applyLarge", submenu: "Font Size", priority: 42 },
      { menu: "Format", label: "Huge", commandId: "core.format.fontSize.applyHuge", submenu: "Font Size", priority: 43 },
      { menu: "Format", label: "Default", commandId: "core.format.fontSize.applyDefault", submenu: "Font Size", priority: 44 },
    ]);
  });

  it.each([
    ["core.format.fontSize.applySmall", FONT_SIZE_SMALL],
    ["core.format.fontSize.applyNormal", FONT_SIZE_NORMAL],
    ["core.format.fontSize.applyLarge", FONT_SIZE_LARGE],
    ["core.format.fontSize.applyHuge", FONT_SIZE_HUGE],
  ] as const)("%s sets the font size to %s on the currently active editor", (commandId, size) => {
    const { chain, calls } = makeChainMock();
    vi.mocked(getActiveEditor).mockReturnValue({ chain: () => chain } as never);
    const ctx = makeContext();

    plugin.activate(ctx);
    ctx.registered.get(commandId)?.();

    expect(calls).toEqual(["focus", ["setFontSize", size], "run"]);
  });

  it("core.format.fontSize.applyDefault clears the font size on the currently active editor", () => {
    const { chain, calls } = makeChainMock();
    vi.mocked(getActiveEditor).mockReturnValue({ chain: () => chain } as never);
    const ctx = makeContext();

    plugin.activate(ctx);
    ctx.registered.get("core.format.fontSize.applyDefault")?.();

    expect(calls).toEqual(["focus", "unsetFontSize", "run"]);
  });

  it("does nothing (doesn't throw) when no editor is currently active", () => {
    vi.mocked(getActiveEditor).mockReturnValue(null);
    const ctx = makeContext();

    plugin.activate(ctx);

    expect(() => ctx.registered.get("core.format.fontSize.applyLarge")?.()).not.toThrow();
    expect(() => ctx.registered.get("core.format.fontSize.applyDefault")?.()).not.toThrow();
  });
});
