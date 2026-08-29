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
// TODO(phase-1/2): implement FileSystemPersistenceProvider.
// TODO(phase-2): in-memory search index (MiniSearch) built from titles +
// extracted text content at startup/on save (§15.1).

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
