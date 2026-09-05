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

/** A fluent chain mock standing in for `Editor.chain()` — records each call in order so a test can assert `focus().toggleBold().run()` was invoked, without a real TipTap instance. */
function makeChainMock() {
  const calls: string[] = [];
  const chain = {
    focus: vi.fn(() => {
      calls.push("focus");
      return chain;
    }),
    toggleBold: vi.fn(() => {
      calls.push("toggleBold");
      return chain;
    }),
    run: vi.fn(() => {
      calls.push("run");
    }),
  };
  return { chain, calls };
}

describe("core.format.bold", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.format.bold");
  });

  it("declares a Format-menu entry pointing at its own command id", () => {
    expect(plugin.manifest.contributes.menu).toEqual([
      { menu: "Format", label: "Bold", commandId: "core.format.bold.apply", priority: 10 },
    ]);
  });

  it("toggles Bold on the currently active editor when run", () => {
    const { chain, calls } = makeChainMock();
    vi.mocked(getActiveEditor).mockReturnValue({ chain: () => chain } as never);
    const ctx = makeContext();

    plugin.activate(ctx);
    ctx.registered.get("core.format.bold.apply")?.();

    expect(calls).toEqual(["focus", "toggleBold", "run"]);
  });

  it("does nothing (doesn't throw) when no editor is currently active", () => {
    vi.mocked(getActiveEditor).mockReturnValue(null);
    const ctx = makeContext();

    plugin.activate(ctx);

    expect(() => ctx.registered.get("core.format.bold.apply")?.()).not.toThrow();
  });
});
