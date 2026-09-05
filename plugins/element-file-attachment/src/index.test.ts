import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@linnote/plugin-sdk";
import { INSERT_FILE_ATTACHMENT_COMMAND, plugin } from "./index";

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

describe("core.element.file-attachment", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.element.file-attachment");
  });

  it("declares the file-attachment canvasElementTypes contribution", () => {
    expect(plugin.manifest.contributes.canvasElementTypes).toEqual([{ type: "file-attachment" }]);
  });

  it("declares an Edit-menu entry and a toolbar entry for the insert command", () => {
    expect(plugin.manifest.contributes.menu).toEqual([
      { menu: "Edit", label: "Insert File Attachment", commandId: INSERT_FILE_ATTACHMENT_COMMAND, priority: 20 },
    ]);
    expect(plugin.manifest.contributes.toolbar).toEqual([
      { label: "Insert File", commandId: INSERT_FILE_ATTACHMENT_COMMAND, priority: 20 },
    ]);
  });

  it("registers the element type and a fallback insert command on activate", () => {
    const ctx = makeContext();

    plugin.activate(ctx);

    expect(ctx.canvas.registerElementType).toHaveBeenCalledWith({ type: "file-attachment" });
    expect(ctx.registered.has(INSERT_FILE_ATTACHMENT_COMMAND)).toBe(true);
    expect(() => ctx.registered.get(INSERT_FILE_ATTACHMENT_COMMAND)?.()).not.toThrow();
  });
});
