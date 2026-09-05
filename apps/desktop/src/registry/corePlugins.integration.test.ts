// NTA-15's acceptance criteria, exercised without a Tauri runtime: "on
// `pnpm tauri dev`, all 15 plugins report active" — this activates the same
// 15 real `plugins/*` packages ../App.tsx wires up, against a real
// `PluginRegistry` and the real `createCommandBus`/`createPluginContextFactory`
// (./createContext.ts), swapping only the fs-backed
// `FileSystemPersistenceProvider` for an in-memory settings store (matching
// ./index.test.ts's `makeFakePersistence` convention) since `@tauri-apps
// /plugin-fs` needs a real Tauri window to talk to.

import { describe, expect, it } from "vitest";
import type { PluginSettingsStore } from "../persistence";
import { PluginRegistry, createCommandBus, createPluginContextFactory } from "./index";
import type { PluginSettingsPersistence } from "./index";

import boldPlugin from "@linnote/plugin-format-bold";
import italicPlugin from "@linnote/plugin-format-italic";
import fontColorPlugin from "@linnote/plugin-format-font-color";
import fontSizePlugin from "@linnote/plugin-format-font-size";
import headersPlugin from "@linnote/plugin-format-headers";
import bulletListPlugin from "@linnote/plugin-format-bullet-list";
import checkboxListPlugin from "@linnote/plugin-format-checkbox-list";
import alignmentPlugin from "@linnote/plugin-format-alignment";
import inkPlugin from "@linnote/plugin-element-ink";
import textSegmentPlugin from "@linnote/plugin-element-text-segment";
import imagePlugin from "@linnote/plugin-element-image";
import fileAttachmentPlugin from "@linnote/plugin-element-file-attachment";
import youtubeEmbedPlugin from "@linnote/plugin-element-youtube-embed";
import oneDrivePlugin from "@linnote/plugin-sync-onedrive";
import googleDrivePlugin from "@linnote/plugin-sync-google-drive";

const CORE_PLUGINS = [
  boldPlugin,
  italicPlugin,
  fontColorPlugin,
  fontSizePlugin,
  headersPlugin,
  bulletListPlugin,
  checkboxListPlugin,
  alignmentPlugin,
  inkPlugin,
  textSegmentPlugin,
  imagePlugin,
  fileAttachmentPlugin,
  youtubeEmbedPlugin,
  oneDrivePlugin,
  googleDrivePlugin,
];

function makeInMemorySettingsPersistence(): PluginSettingsPersistence {
  let store: PluginSettingsStore = {};
  return {
    readPluginSettings: async () => JSON.parse(JSON.stringify(store)),
    writePluginSettings: async (next) => {
      store = JSON.parse(JSON.stringify(next));
    },
  };
}

describe("NTA-15: all 15 core.* plugins activate end-to-end", () => {
  it("reports every one of the 15 plugins as active after activateAll()", async () => {
    expect(CORE_PLUGINS).toHaveLength(15);

    const commandBus = createCommandBus();
    const registry = new PluginRegistry(CORE_PLUGINS, {
      settingsPersistence: makeInMemorySettingsPersistence(),
      createContext: createPluginContextFactory({ commandBus }),
    });

    await registry.activateAll();

    const registered = registry.list();
    expect(registered).toHaveLength(15);
    for (const { plugin, state } of registered) {
      expect(state, `expected ${plugin.manifest.id} to be active`).toBe("active");
    }
  });

  it("core.format.bold's declared menu command is runnable via the shared command bus after activation", async () => {
    const commandBus = createCommandBus();
    const registry = new PluginRegistry(CORE_PLUGINS, {
      settingsPersistence: makeInMemorySettingsPersistence(),
      createContext: createPluginContextFactory({ commandBus }),
    });

    await registry.activateAll();

    const bold = registry.list().find((rp) => rp.plugin.manifest.id === "core.format.bold");
    expect(bold?.state).toBe("active");

    const menuEntry = bold?.plugin.manifest.contributes.menu?.[0];
    expect(menuEntry).toBeDefined();
    expect(commandBus.has(menuEntry!.commandId)).toBe(true);
    expect(() => commandBus.run(menuEntry!.commandId)).not.toThrow();
  });
});
