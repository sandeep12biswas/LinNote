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

/** A fluent chain mock standing in for `Editor.chain()` — records each call (with `toggleHeading`'s argument) in order. */
function makeChainMock() {
  const calls: unknown[] = [];
  const chain = {
    focus: vi.fn(() => {
      calls.push("focus");
      return chain;
    }),
    toggleHeading: vi.fn((options: { level: number }) => {
      calls.push(["toggleHeading", options]);
      return chain;
    }),
    run: vi.fn(() => {
      calls.push("run");
    }),
  };
  return { chain, calls };
}

describe("core.format.headers", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.format.headers");
  });

  it("declares three Format-menu entries (H1-H3) grouped under one Headers submenu", () => {
    expect(plugin.manifest.contributes.menu).toEqual([
      { menu: "Format", label: "Heading 1", commandId: "core.format.headers.applyH1", submenu: "Headers", priority: 30 },
      { menu: "Format", label: "Heading 2", commandId: "core.format.headers.applyH2", submenu: "Headers", priority: 31 },
      { menu: "Format", label: "Heading 3", commandId: "core.format.headers.applyH3", submenu: "Headers", priority: 32 },
    ]);
  });

  it.each([
    ["core.format.headers.applyH1", 1],
    ["core.format.headers.applyH2", 2],
    ["core.format.headers.applyH3", 3],
  ] as const)("%s toggles Heading level %d on the currently active editor", (commandId, level) => {
    const { chain, calls } = makeChainMock();
    vi.mocked(getActiveEditor).mockReturnValue({ chain: () => chain } as never);
    const ctx = makeContext();

    plugin.activate(ctx);
    ctx.registered.get(commandId)?.();

    expect(calls).toEqual(["focus", ["toggleHeading", { level }], "run"]);
  });

  it("does nothing (doesn't throw) when no editor is currently active", () => {
    vi.mocked(getActiveEditor).mockReturnValue(null);
    const ctx = makeContext();

    plugin.activate(ctx);

    expect(() => ctx.registered.get("core.format.headers.applyH2")?.()).not.toThrow();
  });
});
