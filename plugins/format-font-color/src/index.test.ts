import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@linnote/plugin-sdk";
import { getActiveEditor } from "@linnote/rich-text-engine";
import { APPLY_FONT_COLOR_COMMAND, openFontColorPicker, plugin } from "./index";

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

/** A fluent chain mock standing in for `Editor.chain()` — records each call in order. */
function makeChainMock() {
  const calls: unknown[] = [];
  const chain = {
    focus: vi.fn(() => {
      calls.push("focus");
      return chain;
    }),
    setColor: vi.fn((color: string) => {
      calls.push(["setColor", color]);
      return chain;
    }),
    run: vi.fn(() => {
      calls.push("run");
    }),
  };
  return { chain, calls };
}

afterEach(() => {
  // openFontColorPicker cleans up after itself on "change"/"blur", but a
  // test that only dispatches "input" (to check the live-preview path)
  // leaves the hidden element behind — don't let it leak into the next test.
  document.querySelectorAll('input[type="color"]').forEach((el) => el.remove());
});

describe("core.format.font-color", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.format.font-color");
  });

  it("declares a Format-menu entry pointing at its own command id", () => {
    expect(plugin.manifest.contributes.menu).toEqual([
      { menu: "Format", label: "Font Color…", commandId: APPLY_FONT_COLOR_COMMAND, priority: 15 },
    ]);
  });

  it("activate() registers a fallback that opens the picker, without throwing", () => {
    vi.mocked(getActiveEditor).mockReturnValue(null);
    const ctx = makeContext();

    expect(() => plugin.activate(ctx)).not.toThrow();
    expect(ctx.registered.has(APPLY_FONT_COLOR_COMMAND)).toBe(true);
    expect(() => ctx.registered.get(APPLY_FONT_COLOR_COMMAND)?.()).not.toThrow();
    expect(document.querySelector('input[type="color"]')).not.toBeNull(); // the fallback did open a picker
  });
});

describe("openFontColorPicker", () => {
  it("creates a hidden color input pre-filled with the given default", () => {
    openFontColorPicker("#123456");

    const input = document.querySelector('input[type="color"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("#123456");
    expect(input.style.opacity).toBe("0");
  });

  it("applies every live 'input' change to the active editor's text color", () => {
    const { chain, calls } = makeChainMock();
    vi.mocked(getActiveEditor).mockReturnValue({ chain: () => chain } as never);

    openFontColorPicker("#000000");
    const input = document.querySelector('input[type="color"]') as HTMLInputElement;

    input.value = "#abcdef";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(calls).toEqual(["focus", ["setColor", "#abcdef"], "run"]);
  });

  it("does nothing (doesn't throw) on 'input' when no editor is currently active", () => {
    vi.mocked(getActiveEditor).mockReturnValue(null);

    openFontColorPicker("#000000");
    const input = document.querySelector('input[type="color"]') as HTMLInputElement;

    expect(() => input.dispatchEvent(new Event("input", { bubbles: true }))).not.toThrow();
  });

  it("removes the hidden input once the picker closes ('change')", () => {
    openFontColorPicker("#000000");
    expect(document.querySelector('input[type="color"]')).not.toBeNull();

    document.querySelector('input[type="color"]')!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(document.querySelector('input[type="color"]')).toBeNull();
  });
});
