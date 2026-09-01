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

/** A fluent chain mock standing in for `Editor.chain()` — records each call in order so a test can assert `focus().toggleItalic().run()` was invoked, without a real TipTap instance. */
function makeChainMock() {
  const calls: string[] = [];
  const chain = {
    focus: vi.fn(() => {
      calls.push("focus");
      return chain;
    }),
    toggleItalic: vi.fn(() => {
      calls.push("toggleItalic");
      return chain;
    }),
    run: vi.fn(() => {
      calls.push("run");
    }),
  };
  return { chain, calls };
}

describe("core.format.italic", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.format.italic");
  });

  it("declares a Format-menu entry pointing at its own command id", () => {
    expect(plugin.manifest.contributes.menu).toEqual([
      { menu: "Format", label: "Italic", commandId: "core.format.italic.apply", priority: 20 },
    ]);
  });

  it("toggles Italic on the currently active editor when run", () => {
    const { chain, calls } = makeChainMock();
    vi.mocked(getActiveEditor).mockReturnValue({ chain: () => chain } as never);
    const ctx = makeContext();

    plugin.activate(ctx);
    ctx.registered.get("core.format.italic.apply")?.();

    expect(calls).toEqual(["focus", "toggleItalic", "run"]);
  });

  it("does nothing (doesn't throw) when no editor is currently active", () => {
    vi.mocked(getActiveEditor).mockReturnValue(null);
    const ctx = makeContext();

    plugin.activate(ctx);

    expect(() => ctx.registered.get("core.format.italic.apply")?.()).not.toThrow();
  });
});
