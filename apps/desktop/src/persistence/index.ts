// Persistence — docs/architecture.md §15.1. Everything else in the app
// depends on `PersistenceProvider`, never directly on `@tauri-apps/plugin-fs`
// or a future `tauri-plugin-sql` — decide the interface, defer the
// implementation choice, swap it in isolation later (the same move as
// `SyncProvider` in plugins/sync-*, applied to local storage).
//
// v1: `FileSystemPersistenceProvider` — flat JSON via `@tauri-apps/plugin-fs`
// (tree.json, pages/<id>.json, assets/<id>/..., plugins.json). Future:
// `SqlitePersistenceProvider` via `tauri-plugin-sql`, same interface,
// adopted only once note volume/search/transactional-delete needs justify
// it (Phase 11 stretch, §19.1).
//
// This file implements NTA-14: only the `readPluginSettings`/
// `writePluginSettings` slice of `FileSystemPersistenceProvider`, backed by
// a single `plugins.json` file. The tree/page/asset methods are Phase 8
// work (§9 — "Undo/redo, model & persistence") and are stubbed below so the
// class satisfies `PersistenceProvider` without pretending they work yet.
//
// The in-memory search index (MiniSearch) built from titles + extracted
// text content this TODO used to describe is now NTA-56 —
// ../search/index.ts — built at startup from `useWorkspaceTreeStore`'s
// nodes and kept incrementally in sync as they change; not implemented
// here, since it indexes the workspace tree store directly rather than
// going through `PersistenceProvider`. Extracted *page* text specifically
// is still TODO(phase-3/phase-8): `readPage`/`writePage` below are still
// "not implemented", and the Editor Canvas that would produce extractable
// text doesn't exist yet either — see ../search/index.ts's doc comment.

import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

import type { WorkspaceNode, NotePage } from "../types";

export interface PluginSettingsStore {
  [pluginId: string]: { enabled: boolean; settings: unknown };
}

export interface PersistenceProvider {
  readTree(): Promise<WorkspaceNode[]>;
  writeTree(nodes: WorkspaceNode[]): Promise<void>;
  readPage(id: string): Promise<NotePage>;
  writePage(id: string, page: NotePage): Promise<void>;
  deletePage(id: string): Promise<void>;
  readAsset(id: string, name: string): Promise<Blob>;
  writeAsset(id: string, name: string, data: Blob): Promise<void>;
  readPluginSettings(): Promise<PluginSettingsStore>;
  writePluginSettings(store: PluginSettingsStore): Promise<void>;
}

// App-wide plugin enable/disable + settings, independent of any one
// notebook/workspace — lives under the OS-appropriate app config directory
// (e.g. ~/.config/<app>/ on Linux) rather than beside tree.json/pages/*,
// which are workspace content and (per §6) live wherever the user's
// notebook is, not decided by this story.
const PLUGIN_SETTINGS_BASE_DIR = BaseDirectory.AppConfig;
const PLUGIN_SETTINGS_FILE = "plugins.json";
const PLUGIN_SETTINGS_TEMP_FILE = "plugins.json.tmp";

function notImplemented(method: string): Error {
  return new Error(
    `FileSystemPersistenceProvider.${method}() is not implemented — tree/page/asset ` +
      "persistence is Phase 8 work (TODO(phase-8)); NTA-14 only covers " +
      "readPluginSettings/writePluginSettings.",
  );
}

/**
 * v1 `PersistenceProvider`. Per NTA-14, only the plugin-settings slice is
 * real: `plugins.json` under the app config directory, read whole and
 * written whole (it's small — one entry per installed plugin), with a
 * write-to-temp-then-atomic-rename per §6's crash-safety note so a crash
 * or power loss mid-write can never leave `plugins.json` truncated or
 * half-written.
 */
export class FileSystemPersistenceProvider implements PersistenceProvider {
  async readPluginSettings(): Promise<PluginSettingsStore> {
    const fileExists = await exists(PLUGIN_SETTINGS_FILE, { baseDir: PLUGIN_SETTINGS_BASE_DIR });
    if (!fileExists) return {};

    const raw = await readTextFile(PLUGIN_SETTINGS_FILE, { baseDir: PLUGIN_SETTINGS_BASE_DIR });
    return JSON.parse(raw) as PluginSettingsStore;
  }

  async writePluginSettings(store: PluginSettingsStore): Promise<void> {
    // The app config directory may not exist yet on a fresh install;
    // `recursive: true` mirrors `mkdir -p` and is a no-op if it's already
    // there.
    await mkdir(".", { baseDir: PLUGIN_SETTINGS_BASE_DIR, recursive: true });

    const json = JSON.stringify(store, null, 2);
    await writeTextFile(PLUGIN_SETTINGS_TEMP_FILE, json, { baseDir: PLUGIN_SETTINGS_BASE_DIR });
    // Atomic rename over the real file — readers never observe a
    // partially-written `plugins.json`.
    await rename(PLUGIN_SETTINGS_TEMP_FILE, PLUGIN_SETTINGS_FILE, {
      oldPathBaseDir: PLUGIN_SETTINGS_BASE_DIR,
      newPathBaseDir: PLUGIN_SETTINGS_BASE_DIR,
    });
  }

  // ---- Phase 8 (§9): tree/page/asset persistence, not this story --------

  async readTree(): Promise<WorkspaceNode[]> {
    throw notImplemented("readTree");
  }

  async writeTree(_nodes: WorkspaceNode[]): Promise<void> {
    throw notImplemented("writeTree");
  }

  async readPage(_id: string): Promise<NotePage> {
    throw notImplemented("readPage");
  }

  async writePage(_id: string, _page: NotePage): Promise<void> {
    throw notImplemented("writePage");
  }

  async deletePage(_id: string): Promise<void> {
    throw notImplemented("deletePage");
  }

  async readAsset(_id: string, _name: string): Promise<Blob> {
    throw notImplemented("readAsset");
  }

  async writeAsset(_id: string, _name: string, _data: Blob): Promise<void> {
    throw notImplemented("writeAsset");
  }
}
