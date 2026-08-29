import { describe, expect, it } from "vitest";
import type { MenuContribution, ToolbarContribution } from "@linnote/plugin-sdk";
import type { PluginState, RegisteredPlugin } from "../registry";
import { buildMenuBar, buildToolbar } from "./index";

function makeRegisteredPlugin(id: string, state: PluginState, menu: MenuContribution[]): RegisteredPlugin {
  return {
    plugin: {
      manifest: { id, name: id, version: "0.1.0", contributes: { menu } },
      activate: () => {},
    },
    state,
  };
}

function makeRegisteredPluginWithToolbar(
  id: string,
  state: PluginState,
  toolbar: ToolbarContribution[],
): RegisteredPlugin {
  return {
    plugin: {
      manifest: { id, name: id, version: "0.1.0", contributes: { toolbar } },
      activate: () => {},
    },
    state,
  };
}

describe("buildMenuBar", () => {
  it("groups contributions from active plugins by their declared top-level menu", () => {
    const bold = makeRegisteredPlugin("core.format.bold", "active", [
      { menu: "Format", label: "Bold", commandId: "applyBold" },
    ]);
    const undo = makeRegisteredPlugin("core.edit.undo", "active", [
      { menu: "Edit", label: "Undo", commandId: "undo" },
    ]);

    const model = buildMenuBar([bold, undo]);

    expect(model.map((m) => m.menu)).toEqual(["Edit", "Format"]);
    expect(model.find((m) => m.menu === "Format")?.entries).toEqual([
      { kind: "item", item: { label: "Bold", commandId: "applyBold" } },
    ]);
  });

  it("excludes contributions from disabled and failed plugins", () => {
    const active = makeRegisteredPlugin("core.format.bold", "active", [
      { menu: "Format", label: "Bold", commandId: "applyBold" },
    ]);
    const disabled = makeRegisteredPlugin("core.format.italic", "disabled", [
      { menu: "Format", label: "Italic", commandId: "applyItalic" },
    ]);
    const failed = makeRegisteredPlugin("core.format.underline", "failed", [
      { menu: "Format", label: "Underline", commandId: "applyUnderline" },
    ]);

    const model = buildMenuBar([active, disabled, failed]);

    expect(model).toEqual([
      { menu: "Format", entries: [{ kind: "item", item: { label: "Bold", commandId: "applyBold" } }] },
    ]);
  });

  it("omits a top-level menu with no active contributions", () => {
    const model = buildMenuBar([makeRegisteredPlugin("a", "disabled", [{ menu: "File", label: "New", commandId: "new" }])]);
    expect(model).toEqual([]);
  });

  it("keeps top-level menus in canonical order regardless of activation order", () => {
    const help = makeRegisteredPlugin("core.help", "active", [{ menu: "Help", label: "About", commandId: "about" }]);
    const file = makeRegisteredPlugin("core.file", "active", [{ menu: "File", label: "New", commandId: "new" }]);

    // Declared "dependent-looking" order on purpose (Help before File) —
    // the resolved model must still follow TOP_LEVEL_MENUS order.
    const model = buildMenuBar([help, file]);

    expect(model.map((m) => m.menu)).toEqual(["File", "Help"]);
  });

  it("sorts items within a menu by priority, undeclared priority last, ties in activation order", () => {
    const plugin = makeRegisteredPlugin("core.format.multi", "active", [
      { menu: "Format", label: "No priority A", commandId: "a" },
      { menu: "Format", label: "High", commandId: "high", priority: 1 },
      { menu: "Format", label: "No priority B", commandId: "b" },
      { menu: "Format", label: "Mid", commandId: "mid", priority: 5 },
    ]);

    const model = buildMenuBar([plugin]);

    expect(model[0].entries.map((e) => (e.kind === "item" ? e.item.commandId : null))).toEqual([
      "high",
      "mid",
      "a",
      "b",
    ]);
  });

  it("nests submenu-tagged items under a single submenu entry, sorted internally by priority", () => {
    const plugin = makeRegisteredPlugin("core.format.alignment", "active", [
      { menu: "Format", label: "Right", commandId: "alignRight", submenu: "Alignment", priority: 3 },
      { menu: "Format", label: "Left", commandId: "alignLeft", submenu: "Alignment", priority: 1 },
      { menu: "Format", label: "Bold", commandId: "applyBold", priority: 2 },
    ]);

    const model = buildMenuBar([plugin]);

    expect(model[0].entries).toEqual([
      {
        kind: "submenu",
        submenu: {
          label: "Alignment",
          items: [
            { label: "Left", commandId: "alignLeft" },
            { label: "Right", commandId: "alignRight" },
          ],
        },
      },
      { kind: "item", item: { label: "Bold", commandId: "applyBold" } },
    ]);
  });

  it("positions a submenu among sibling items by its lowest-priority item", () => {
    const plugin = makeRegisteredPlugin("core.format.mixed", "active", [
      { menu: "Format", label: "After", commandId: "after", priority: 10 },
      { menu: "Format", label: "Sub item", commandId: "subItem", submenu: "Group", priority: 1 },
      { menu: "Format", label: "Before", commandId: "before", priority: 0 },
    ]);

    const model = buildMenuBar([plugin]);

    expect(model[0].entries.map((e) => (e.kind === "item" ? e.item.commandId : `submenu:${e.submenu.label}`))).toEqual([
      "before",
      "submenu:Group",
      "after",
    ]);
  });

  it("returns an empty model for no plugins", () => {
    expect(buildMenuBar([])).toEqual([]);
  });
});

describe("buildToolbar", () => {
  it("sorts buttons by priority, undeclared priority last, ties in activation order", () => {
    const plugin = makeRegisteredPluginWithToolbar("core.format.multi", "active", [
      { label: "No priority A", commandId: "a" },
      { label: "High", commandId: "high", priority: 1 },
      { label: "No priority B", commandId: "b" },
      { label: "Mid", commandId: "mid", priority: 5 },
    ]);

    const model = buildToolbar([plugin]);

    expect(model.map((b) => b.commandId)).toEqual(["high", "mid", "a", "b"]);
  });

  it("keeps ties in activation order across plugins", () => {
    const first = makeRegisteredPluginWithToolbar("core.a", "active", [{ label: "First", commandId: "first" }]);
    const second = makeRegisteredPluginWithToolbar("core.b", "active", [{ label: "Second", commandId: "second" }]);

    const model = buildToolbar([first, second]);

    expect(model.map((b) => b.commandId)).toEqual(["first", "second"]);
  });

  it("excludes contributions from disabled and failed plugins", () => {
    const active = makeRegisteredPluginWithToolbar("core.format.bold", "active", [
      { label: "Bold", commandId: "applyBold" },
    ]);
    const disabled = makeRegisteredPluginWithToolbar("core.format.italic", "disabled", [
      { label: "Italic", commandId: "applyItalic" },
    ]);
    const failed = makeRegisteredPluginWithToolbar("core.format.underline", "failed", [
      { label: "Underline", commandId: "applyUnderline" },
    ]);

    const model = buildToolbar([active, disabled, failed]);

    expect(model).toEqual([{ label: "Bold", icon: undefined, commandId: "applyBold" }]);
  });

  it("carries the icon through when declared", () => {
    const plugin = makeRegisteredPluginWithToolbar("core.format.bold", "active", [
      { label: "Bold", icon: "bold-icon", commandId: "applyBold" },
    ]);

    const model = buildToolbar([plugin]);

    expect(model).toEqual([{ label: "Bold", icon: "bold-icon", commandId: "applyBold" }]);
  });

  it("returns an empty model for no plugins", () => {
    expect(buildToolbar([])).toEqual([]);
  });
});
