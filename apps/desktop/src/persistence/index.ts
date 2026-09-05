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
// This file implemented NTA-14 first: only the `readPluginSettings`/
// `writePluginSettings` slice. NTA-69 (Phase 8) fills in the rest —
// `readTree`/`writeTree`, `readPage`/`writePage`/`deletePage`,
// `readAsset`/`writeAsset` — all real now, no more "not implemented"
// stubs.
//
// **Workspace root, decided with the user (not specified anywhere in
// docs/architecture.md — a real gap, not an oversight, this ticket
// closes)**: `Documents/LinNote/` — visible and discoverable, the way
// OneNote's own notebook folder is, rather than a hidden app-managed
// directory. No folder-picker UI exists yet (out of this ticket's
// scope), so v1 has exactly one, fixed workspace location.
//
// **Crash safety (NTA-71)**: every write below goes through
// `writeJsonAtomic`/`writeBinaryAtomic` — write to a `.tmp` sibling,
// then atomically rename over the real file (mirroring NTA-14's own
// `writePluginSettings`, now refactored to share the same helper) — a
// crash or power loss mid-write can never leave a file truncated or
// half-written.
//
// **schemaVersion + migration (NTA-72)**: `migrateTree`/`migratePage`/
// `migratePluginSettings` below are each their own small, independent
// path — deliberately not one shared generic, since each store's future
// migration steps have nothing to do with either other's. Every
// version that has ever existed is 1 (there's nothing to migrate away
// from yet); a file with no `schemaVersion` field at all (NTA-14's
// original bare-object `plugins.json` shape, from before this ticket)
// is treated as version 0 and passed through unchanged, since nothing
// about that shape actually needs to change to become "version 1's
// data" — the wrapper is new, the payload isn't. The next real schema
// change adds a `case 1: return migrateSomethingFrom1To2(...)` branch,
// not a rewrite of this function.
//
// The in-memory search index (MiniSearch) built from titles + extracted
// text content this TODO used to describe is now NTA-56 —
// ../search/index.ts — built at startup from `useWorkspaceTreeStore`'s
// nodes and kept incrementally in sync as they change; not implemented
// here, since it indexes the workspace tree store directly rather than
// going through `PersistenceProvider`. Extracted *page* text content
// indexing is still a gap (NTA-56's own doc comment already flagged
// this as pending "Phase 3/8" — the Editor Canvas exists now, but
// nothing wires its text into the search index yet); out of this
// ticket's own scope (persistence, not search).

import {
  BaseDirectory,
  exists,
  mkdir,
  readFile,
  readTextFile,
  remove,
  rename,
  writeFile,
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

// ---- Plugin settings — app-wide, independent of any one workspace -----
// Lives under the OS-appropriate app config directory (e.g.
// ~/.config/<app>/ on Linux) rather than beside tree.json/pages/*, which
// are workspace content living under the workspace root below.
const PLUGIN_SETTINGS_BASE_DIR = BaseDirectory.AppConfig;
const PLUGIN_SETTINGS_FILE = "plugins.json";
const PLUGIN_SETTINGS_TEMP_FILE = "plugins.json.tmp";

// ---- Workspace root (NTA-69) --------------------------------------------
const WORKSPACE_BASE_DIR = BaseDirectory.Document;
const WORKSPACE_ROOT = "LinNote";
const TREE_FILE = `${WORKSPACE_ROOT}/tree.json`;
const TREE_TEMP_FILE = `${WORKSPACE_ROOT}/tree.json.tmp`;
const PAGES_DIR = `${WORKSPACE_ROOT}/pages`;
const ASSETS_DIR = `${WORKSPACE_ROOT}/assets`;

function pagePath(id: string): string {
  return `${PAGES_DIR}/${id}.json`;
}
function pageTempPath(id: string): string {
  return `${PAGES_DIR}/${id}.json.tmp`;
}
function assetDir(id: string): string {
  return `${ASSETS_DIR}/${id}`;
}
function assetPath(id: string, name: string): string {
  return `${assetDir(id)}/${name}`;
}
function assetTempPath(id: string, name: string): string {
  return `${assetDir(id)}/${name}.tmp`;
}

// ---- Crash-safe writes (NTA-71) -----------------------------------------

/** Writes `json` to `tempPath`, then atomically renames it over `path` — never leaves `path` truncated or half-written if the app crashes or loses power mid-write. */
async function writeJsonAtomic(path: string, tempPath: string, baseDir: BaseDirectory, data: unknown): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await writeTextFile(tempPath, json, { baseDir });
  await rename(tempPath, path, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir });
}

/** Binary counterpart of `writeJsonAtomic`, for asset bytes. */
async function writeBinaryAtomic(path: string, tempPath: string, baseDir: BaseDirectory, data: Uint8Array): Promise<void> {
  await writeFile(tempPath, data, { baseDir });
  await rename(tempPath, path, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir });
}

// ---- schemaVersion + migration (NTA-72) ---------------------------------

export const CURRENT_TREE_SCHEMA_VERSION = 1;
export const CURRENT_PAGE_SCHEMA_VERSION = 1;
export const CURRENT_PLUGIN_SETTINGS_SCHEMA_VERSION = 1;

interface TreeFile {
  schemaVersion: number;
  nodes: WorkspaceNode[];
}

type PageFile = NotePage & { schemaVersion: number };

interface PluginSettingsFile {
  schemaVersion: number;
  plugins: PluginSettingsStore;
}

/** `raw` is either version 0 (a bare `WorkspaceNode[]`, from before this ticket) or a versioned `TreeFile`. */
function migrateTree(raw: unknown): WorkspaceNode[] {
  if (Array.isArray(raw)) return raw as WorkspaceNode[];
  const file = raw as TreeFile;
  switch (file.schemaVersion) {
    case 1:
      return file.nodes;
    default:
      throw new Error(`tree.json: unknown schemaVersion ${file.schemaVersion}`);
  }
}

/** `raw` is either version 0 (a bare `NotePage`, from before this ticket) or a versioned `PageFile`. */
function migratePage(raw: unknown): NotePage {
  const file = raw as Partial<PageFile>;
  if (file.schemaVersion == null) return file as NotePage;
  switch (file.schemaVersion) {
    case 1: {
      const { schemaVersion: _schemaVersion, ...page } = file as PageFile;
      return page;
    }
    default:
      throw new Error(`page ${String(file.id)}: unknown schemaVersion ${file.schemaVersion}`);
  }
}

/** `raw` is either version 0 (NTA-14's original bare `PluginSettingsStore`) or a versioned `PluginSettingsFile`. */
function migratePluginSettings(raw: unknown): PluginSettingsStore {
  if (raw && typeof raw === "object" && !("schemaVersion" in raw)) return raw as PluginSettingsStore;
  const file = raw as PluginSettingsFile;
  switch (file.schemaVersion) {
    case 1:
      return file.plugins;
    default:
      throw new Error(`plugins.json: unknown schemaVersion ${file.schemaVersion}`);
  }
}

/**
 * v1 `PersistenceProvider` — flat JSON via `@tauri-apps/plugin-fs`, one
 * file per workspace tree / page / asset / plugin-settings store, each
 * write crash-safe (temp-then-rename) and versioned (`schemaVersion`).
 */
export class FileSystemPersistenceProvider implements PersistenceProvider {
  // ---- Plugin settings (NTA-14, now versioned per NTA-72) --------------

  async readPluginSettings(): Promise<PluginSettingsStore> {
    const fileExists = await exists(PLUGIN_SETTINGS_FILE, { baseDir: PLUGIN_SETTINGS_BASE_DIR });
    if (!fileExists) return {};

    const raw = await readTextFile(PLUGIN_SETTINGS_FILE, { baseDir: PLUGIN_SETTINGS_BASE_DIR });
    return migratePluginSettings(JSON.parse(raw));
  }

  async writePluginSettings(store: PluginSettingsStore): Promise<void> {
    // The app config directory may not exist yet on a fresh install;
    // `recursive: true` mirrors `mkdir -p` and is a no-op if it's already
    // there.
    await mkdir(".", { baseDir: PLUGIN_SETTINGS_BASE_DIR, recursive: true });
    const file: PluginSettingsFile = { schemaVersion: CURRENT_PLUGIN_SETTINGS_SCHEMA_VERSION, plugins: store };
    await writeJsonAtomic(PLUGIN_SETTINGS_FILE, PLUGIN_SETTINGS_TEMP_FILE, PLUGIN_SETTINGS_BASE_DIR, file);
  }

  // ---- Workspace tree (NTA-69) ------------------------------------------

  async readTree(): Promise<WorkspaceNode[]> {
    const fileExists = await exists(TREE_FILE, { baseDir: WORKSPACE_BASE_DIR });
    if (!fileExists) return []; // fresh workspace — ../workspace/index.ts seeds a default notebook and writes it back the first time

    const raw = await readTextFile(TREE_FILE, { baseDir: WORKSPACE_BASE_DIR });
    return migrateTree(JSON.parse(raw));
  }

  async writeTree(nodes: WorkspaceNode[]): Promise<void> {
    await mkdir(WORKSPACE_ROOT, { baseDir: WORKSPACE_BASE_DIR, recursive: true });
    const file: TreeFile = { schemaVersion: CURRENT_TREE_SCHEMA_VERSION, nodes };
    await writeJsonAtomic(TREE_FILE, TREE_TEMP_FILE, WORKSPACE_BASE_DIR, file);
  }

  // ---- Pages (NTA-69) ----------------------------------------------------

  async readPage(id: string): Promise<NotePage> {
    const path = pagePath(id);
    const fileExists = await exists(path, { baseDir: WORKSPACE_BASE_DIR });
    if (!fileExists) throw new Error(`readPage(${id}): pages/${id}.json does not exist`);

    const raw = await readTextFile(path, { baseDir: WORKSPACE_BASE_DIR });
    return migratePage(JSON.parse(raw));
  }

  async writePage(id: string, page: NotePage): Promise<void> {
    await mkdir(PAGES_DIR, { baseDir: WORKSPACE_BASE_DIR, recursive: true });
    const file: PageFile = { ...page, schemaVersion: CURRENT_PAGE_SCHEMA_VERSION };
    await writeJsonAtomic(pagePath(id), pageTempPath(id), WORKSPACE_BASE_DIR, file);
  }

  async deletePage(id: string): Promise<void> {
    const path = pagePath(id);
    const fileExists = await exists(path, { baseDir: WORKSPACE_BASE_DIR });
    if (!fileExists) return; // already gone — deleting twice (e.g. a retried operation) is not an error
    await remove(path, { baseDir: WORKSPACE_BASE_DIR });
  }

  // ---- Assets (NTA-69) ----------------------------------------------------

  async readAsset(id: string, name: string): Promise<Blob> {
    const bytes = await readFile(assetPath(id, name), { baseDir: WORKSPACE_BASE_DIR });
    return new Blob([bytes]);
  }

  async writeAsset(id: string, name: string, data: Blob): Promise<void> {
    await mkdir(assetDir(id), { baseDir: WORKSPACE_BASE_DIR, recursive: true });
    const bytes = new Uint8Array(await data.arrayBuffer());
    await writeBinaryAtomic(assetPath(id, name), assetTempPath(id, name), WORKSPACE_BASE_DIR, bytes);
  }
}

/**
 * The one `PersistenceProvider` instance a real running app session
 * shares — stateless to construct, so a single instance is exactly as
 * good as passing one down everywhere, without threading it through
 * every component (`../canvas-core/CanvasViewport.tsx`) or test call
 * site along the way. `./autosave.ts`'s functions still take a
 * `PersistenceProvider` *parameter* rather than importing this directly
 * — good for testing autosave.ts against a fake — this is what real
 * callers (`../App.tsx`, `../canvas-core/CanvasViewport.tsx`) pass in.
 */
export const defaultPersistenceProvider: PersistenceProvider = new FileSystemPersistenceProvider();
