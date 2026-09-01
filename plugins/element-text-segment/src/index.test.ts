import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@linnote/plugin-sdk";
import { plugin } from "./index";

describe("core.element.text-segment", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.element.text-segment");
  });

  it("declares a canvasElementTypes contribution for the segment element type", () => {
    expect(plugin.manifest.contributes.canvasElementTypes).toEqual([{ type: "segment" }]);
  });

  it("registers the segment element type on activate()", () => {
    const registerElementType = vi.fn();
    const ctx = { canvas: { registerElementType } } as unknown as PluginContext;

    plugin.activate(ctx);

    expect(registerElementType).toHaveBeenCalledWith({ type: "segment" });
  });
});
