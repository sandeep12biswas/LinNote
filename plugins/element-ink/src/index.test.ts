import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@linnote/plugin-sdk";
import { plugin, TOGGLE_INK_PANEL_COMMAND } from "./index";

describe("core.element.ink", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.element.ink");
  });

  it("declares a canvasElementTypes contribution for the ink element type", () => {
    expect(plugin.manifest.contributes.canvasElementTypes).toEqual([{ type: "ink" }]);
  });

  it("declares a toolbar and menu contribution for the tool-panel toggle command (NTA-92)", () => {
    expect(plugin.manifest.contributes.toolbar).toEqual([
      { label: "Ink", commandId: TOGGLE_INK_PANEL_COMMAND, priority: 30 },
    ]);
    expect(plugin.manifest.contributes.menu).toEqual([
      { menu: "Edit", label: "Ink", commandId: TOGGLE_INK_PANEL_COMMAND, priority: 30 },
    ]);
  });

  it("registers the ink element type on activate()", () => {
    const registerElementType = vi.fn();
    const ctx = { canvas: { registerElementType }, commands: { register: vi.fn() } } as unknown as PluginContext;

    plugin.activate(ctx);

    expect(registerElementType).toHaveBeenCalledWith({ type: "ink" });
  });

  it("registers a fallback handler for TOGGLE_INK_PANEL_COMMAND on activate()", () => {
    const register = vi.fn();
    const ctx = { canvas: { registerElementType: vi.fn() }, commands: { register } } as unknown as PluginContext;

    plugin.activate(ctx);

    expect(register).toHaveBeenCalledWith(TOGGLE_INK_PANEL_COMMAND, expect.any(Function));
    // The fallback itself is inert — just logs; canvas-core/InkLayerHost.tsx installs the real one.
    const [, fallback] = register.mock.calls[0] as [string, () => void];
    expect(() => fallback()).not.toThrow();
  });
});
