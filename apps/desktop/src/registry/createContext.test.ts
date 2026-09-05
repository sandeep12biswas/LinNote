import { describe, expect, it, vi } from "vitest";
import { createCommandBus, createPluginContextFactory } from "./createContext";

describe("createCommandBus", () => {
  it("runs a registered command with the given arguments", () => {
    const bus = createCommandBus();
    const fn = vi.fn(() => "result");
    bus.register("cmd.a", fn);

    expect(bus.has("cmd.a")).toBe(true);
    expect(bus.run("cmd.a", 1, 2)).toBe("result");
    expect(fn).toHaveBeenCalledWith(1, 2);
  });

  it("running an unregistered command warns and returns undefined instead of throwing", () => {
    const bus = createCommandBus();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => bus.run("cmd.missing")).not.toThrow();
    expect(bus.run("cmd.missing")).toBeUndefined();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("is shared: a command registered via one context is runnable via the same bus directly", () => {
    const bus = createCommandBus();
    const createContext = createPluginContextFactory({ commandBus: bus });
    const ctx = createContext("core.format.bold");

    const fn = vi.fn();
    ctx.commands.register("core.format.bold.apply", fn);

    bus.run("core.format.bold.apply");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("is shared in the other direction too: app-side code can overwrite a plugin's own registration (NTA-38)", () => {
    const bus = createCommandBus();
    const createContext = createPluginContextFactory({ commandBus: bus });
    const ctx = createContext("core.element.text-segment");

    const fallback = vi.fn();
    ctx.commands.register("core.element.text-segment.createVisible", fallback);
    const real = vi.fn();
    bus.register("core.element.text-segment.createVisible", real); // app-side (e.g. SegmentLayerHost) overwrites it once live state exists

    bus.run("core.element.text-segment.createVisible");
    expect(real).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("unregister removes a command, so running it afterward falls back to the warn-and-no-op path", () => {
    const bus = createCommandBus();
    const fn = vi.fn();
    bus.register("cmd.a", fn);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    bus.unregister("cmd.a");

    expect(bus.has("cmd.a")).toBe(false);
    expect(bus.run("cmd.a")).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("unregister on an id that was never registered is a no-op, not an error", () => {
    const bus = createCommandBus();
    expect(() => bus.unregister("cmd.never-registered")).not.toThrow();
  });
});

describe("createPluginContextFactory", () => {
  it("scopes storage per plugin id — one plugin can't read another's namespace", async () => {
    const createContext = createPluginContextFactory({ commandBus: createCommandBus() });
    const ctxA = createContext("plugin.a");
    const ctxB = createContext("plugin.b");

    await ctxA.storage.set("key", "a-value");
    await ctxB.storage.set("key", "b-value");

    expect(await ctxA.storage.get("key")).toBe("a-value");
    expect(await ctxB.storage.get("key")).toBe("b-value");
  });

  it("persists a plugin's storage across repeated createContext calls for the same id", async () => {
    const createContext = createPluginContextFactory({ commandBus: createCommandBus() });
    await createContext("plugin.a").storage.set("key", "value");

    expect(await createContext("plugin.a").storage.get("key")).toBe("value");
  });

  it("events.on handlers are invoked by events.emit", () => {
    const createContext = createPluginContextFactory({ commandBus: createCommandBus() });
    const ctx = createContext("plugin.a");
    const handler = vi.fn();

    ctx.events.on("thing-happened", handler);
    ctx.events.emit("thing-happened", 42);

    expect(handler).toHaveBeenCalledWith(42);
  });

  it("menu.addItem and canvas.registerElementType accept contributions without throwing", () => {
    const createContext = createPluginContextFactory({ commandBus: createCommandBus() });
    const ctx = createContext("plugin.a");

    expect(() =>
      ctx.menu.addItem({ menu: "Format", label: "Bold", commandId: "core.format.bold.apply" }),
    ).not.toThrow();
    expect(() => ctx.canvas.registerElementType({ type: "ink" })).not.toThrow();
  });
});
