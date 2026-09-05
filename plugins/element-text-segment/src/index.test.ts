import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@linnote/plugin-sdk";
import { CREATE_VISIBLE_SEGMENT_COMMAND, plugin } from "./index";

describe("core.element.text-segment", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.element.text-segment");
  });

  it("declares a canvasElementTypes contribution for the segment element type", () => {
    expect(plugin.manifest.contributes.canvasElementTypes).toEqual([{ type: "segment" }]);
  });

  it("declares a toolbar and menu contribution for the deliberate visible-creation command (NTA-38)", () => {
    expect(plugin.manifest.contributes.toolbar).toEqual([
      { label: "Add Segment", commandId: CREATE_VISIBLE_SEGMENT_COMMAND, priority: 10 },
    ]);
    expect(plugin.manifest.contributes.menu).toEqual([
      { menu: "Edit", label: "Add Segment", commandId: CREATE_VISIBLE_SEGMENT_COMMAND, priority: 10 },
    ]);
  });

  it("registers the segment element type on activate()", () => {
    const registerElementType = vi.fn();
    const ctx = { canvas: { registerElementType }, commands: { register: vi.fn() } } as unknown as PluginContext;

    plugin.activate(ctx);

    expect(registerElementType).toHaveBeenCalledWith({ type: "segment" });
  });

  it("registers a fallback handler for CREATE_VISIBLE_SEGMENT_COMMAND on activate()", () => {
    const register = vi.fn();
    const ctx = { canvas: { registerElementType: vi.fn() }, commands: { register } } as unknown as PluginContext;

    plugin.activate(ctx);

    expect(register).toHaveBeenCalledWith(CREATE_VISIBLE_SEGMENT_COMMAND, expect.any(Function));
    // The fallback itself is inert — just logs; canvas-core/SegmentLayerHost.tsx installs the real one.
    const [, fallback] = register.mock.calls[0] as [string, () => void];
    expect(() => fallback()).not.toThrow();
  });
});
