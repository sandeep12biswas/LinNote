import { beforeEach, describe, expect, it, vi } from "vitest";

// `@tauri-apps/plugin-fs` only exists inside a real Tauri runtime, so we
// fake it with an in-memory filesystem keyed by "<baseDir>:<path>" — real
// enough to exercise read/write/exists/rename/mkdir/remove semantics
// (including atomic-rename-over-an-existing-file, and binary read/write
// for assets) without a webview or an OS.
vi.mock("@tauri-apps/plugin-fs", () => {
  const files = new Map<string, string | Uint8Array>();
  const dirs = new Set<string>();
  const key = (path: string, baseDir: unknown) => `${String(baseDir)}:${path}`;

  return {
    BaseDirectory: { AppConfig: 13, Document: 11 },
    __mockFs: { files, dirs, key }, // test-only escape hatch, see below
    exists: vi.fn(async (path: string, opts: { baseDir: unknown }) => files.has(key(path, opts.baseDir))),
    readTextFile: vi.fn(async (path: string, opts: { baseDir: unknown }) => {
      const k = key(path, opts.baseDir);
      if (!files.has(k)) throw new Error(`ENOENT: ${path}`);
      return files.get(k) as string;
    }),
    writeTextFile: vi.fn(async (path: string, contents: string, opts: { baseDir: unknown }) => {
      files.set(key(path, opts.baseDir), contents);
    }),
    readFile: vi.fn(async (path: string, opts: { baseDir: unknown }) => {
      const k = key(path, opts.baseDir);
      if (!files.has(k)) throw new Error(`ENOENT: ${path}`);
      return files.get(k) as Uint8Array;
    }),
    writeFile: vi.fn(async (path: string, data: Uint8Array, opts: { baseDir: unknown }) => {
      files.set(key(path, opts.baseDir), data);
    }),
    mkdir: vi.fn(async (path: string, opts: { baseDir: unknown; recursive?: boolean }) => {
      dirs.add(key(path, opts.baseDir));
    }),
    rename: vi.fn(
      async (
        oldPath: string,
        newPath: string,
        opts: { oldPathBaseDir: unknown; newPathBaseDir: unknown },
      ) => {
        const oldKey = key(oldPath, opts.oldPathBaseDir);
        const newKey = key(newPath, opts.newPathBaseDir);
        if (!files.has(oldKey)) throw new Error(`ENOENT: ${oldPath}`);
        files.set(newKey, files.get(oldKey) as string | Uint8Array);
        files.delete(oldKey);
      },
    ),
    remove: vi.fn(async (path: string, opts: { baseDir: unknown }) => {
      files.delete(key(path, opts.baseDir));
    }),
  };
});

import * as fsMock from "@tauri-apps/plugin-fs";
import type { NotePage, WorkspaceNode } from "../types";
import type { PluginSettingsStore } from "./index";
import { FileSystemPersistenceProvider } from "./index";

// The escape hatch declared inside the mock factory above, typed loosely
// since it's test-only.
const mockFs = fsMock as unknown as {
  __mockFs: { files: Map<string, string | Uint8Array>; dirs: Set<string> };
};

function makeNode(overrides: Partial<WorkspaceNode> = {}): WorkspaceNode {
  return {
    id: "node-1",
    parentId: null,
    type: "notebook",
    title: "My Notebook",
    order: "a0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    trashedAt: null,
    ...overrides,
  };
}

function makePage(overrides: Partial<NotePage> = {}): NotePage {
  return {
    id: "page-1",
    header: { title: "Untitled", align: "left" },
    background: { kind: "color", color: "#ffffff" },
    elements: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("FileSystemPersistenceProvider", () => {
  beforeEach(() => {
    mockFs.__mockFs.files.clear();
    mockFs.__mockFs.dirs.clear();
    vi.clearAllMocks();
  });

  describe("plugin settings (NTA-14)", () => {
    it("readPluginSettings returns {} when plugins.json doesn't exist yet", async () => {
      const provider = new FileSystemPersistenceProvider();
      await expect(provider.readPluginSettings()).resolves.toEqual({});
    });

    it("round-trips a plugin's enabled flag and settings through a real write + read", async () => {
      const provider = new FileSystemPersistenceProvider();
      const store: PluginSettingsStore = {
        "core.format.bold": { enabled: true, settings: { shortcut: "Mod-b" } },
        "core.sync.onedrive": { enabled: false, settings: null },
      };

      await provider.writePluginSettings(store);

      // Simulates "restart the app": a brand-new provider instance reads
      // back whatever the previous instance persisted to disk.
      const restarted = new FileSystemPersistenceProvider();
      await expect(restarted.readPluginSettings()).resolves.toEqual(store);
    });

    it("writes to a temp file then atomically renames it over plugins.json", async () => {
      const provider = new FileSystemPersistenceProvider();
      const store: PluginSettingsStore = { "core.format.italic": { enabled: true, settings: null } };

      await provider.writePluginSettings(store);

      const writeTextFile = vi.mocked(fsMock.writeTextFile);
      const rename = vi.mocked(fsMock.rename);

      // Wrote to plugins.json.tmp, never straight to plugins.json.
      expect(writeTextFile).toHaveBeenCalledTimes(1);
      const [writtenPath] = writeTextFile.mock.calls[0];
      expect(writtenPath).toBe("plugins.json.tmp");
      expect(writtenPath).not.toBe("plugins.json");

      // Then renamed the temp file over the real one, atomically.
      expect(rename).toHaveBeenCalledTimes(1);
      const [oldPath, newPath] = rename.mock.calls[0];
      expect(oldPath).toBe("plugins.json.tmp");
      expect(newPath).toBe("plugins.json");

      // No trace of the temp file left behind afterwards.
      expect(mockFs.__mockFs.files.has("13:plugins.json.tmp")).toBe(false);
      expect(mockFs.__mockFs.files.has("13:plugins.json")).toBe(true);
    });

    it("overwrites a previous plugins.json without ever leaving it half-written", async () => {
      const provider = new FileSystemPersistenceProvider();
      await provider.writePluginSettings({ a: { enabled: true, settings: null } });
      await provider.writePluginSettings({ a: { enabled: false, settings: { x: 1 } } });

      await expect(provider.readPluginSettings()).resolves.toEqual({
        a: { enabled: false, settings: { x: 1 } },
      });
    });

    it("ensures the app config directory exists before writing", async () => {
      const provider = new FileSystemPersistenceProvider();
      await provider.writePluginSettings({});

      expect(vi.mocked(fsMock.mkdir)).toHaveBeenCalledWith(".", expect.objectContaining({ recursive: true }));
    });

    it("writes a schemaVersion wrapper, and reads a pre-NTA-72 bare-object file (no schemaVersion field) as version 0", async () => {
      const provider = new FileSystemPersistenceProvider();
      await provider.writePluginSettings({ a: { enabled: true, settings: null } });

      const raw = JSON.parse(mockFs.__mockFs.files.get("13:plugins.json") as string);
      expect(raw).toMatchObject({ schemaVersion: 1, plugins: { a: { enabled: true, settings: null } } });

      // Simulate a pre-NTA-72 file: bare object, no wrapper at all.
      mockFs.__mockFs.files.set("13:plugins.json", JSON.stringify({ legacy: { enabled: true, settings: null } }));
      await expect(provider.readPluginSettings()).resolves.toEqual({ legacy: { enabled: true, settings: null } });
    });
  });

  describe("workspace tree (NTA-69)", () => {
    it("readTree returns [] when tree.json doesn't exist yet", async () => {
      const provider = new FileSystemPersistenceProvider();
      await expect(provider.readTree()).resolves.toEqual([]);
    });

    it("round-trips the tree through a real write + read", async () => {
      const provider = new FileSystemPersistenceProvider();
      const nodes = [makeNode({ id: "a" }), makeNode({ id: "b", parentId: "a", type: "folder" })];

      await provider.writeTree(nodes);

      const restarted = new FileSystemPersistenceProvider();
      await expect(restarted.readTree()).resolves.toEqual(nodes);
    });

    it("writes tree.json under Documents/LinNote via temp-then-atomic-rename", async () => {
      const provider = new FileSystemPersistenceProvider();
      await provider.writeTree([makeNode()]);

      const writeTextFile = vi.mocked(fsMock.writeTextFile);
      const rename = vi.mocked(fsMock.rename);
      expect(writeTextFile).toHaveBeenCalledWith("LinNote/tree.json.tmp", expect.any(String), {
        baseDir: 11, // BaseDirectory.Document
      });
      expect(rename).toHaveBeenCalledWith("LinNote/tree.json.tmp", "LinNote/tree.json", {
        oldPathBaseDir: 11,
        newPathBaseDir: 11,
      });
      expect(mockFs.__mockFs.files.has("11:LinNote/tree.json.tmp")).toBe(false);
    });

    it("reads a pre-NTA-72 bare-array tree.json (no schemaVersion wrapper) as version 0", async () => {
      const provider = new FileSystemPersistenceProvider();
      const nodes = [makeNode()];
      mockFs.__mockFs.dirs.add("11:LinNote");
      mockFs.__mockFs.files.set("11:LinNote/tree.json", JSON.stringify(nodes));

      await expect(provider.readTree()).resolves.toEqual(nodes);
    });

    it("rejects a tree.json with an unrecognized schemaVersion", async () => {
      const provider = new FileSystemPersistenceProvider();
      mockFs.__mockFs.files.set("11:LinNote/tree.json", JSON.stringify({ schemaVersion: 99, nodes: [] }));

      await expect(provider.readTree()).rejects.toThrow(/unknown schemaVersion/i);
    });
  });

  describe("pages (NTA-69)", () => {
    it("readPage throws when the page doesn't exist", async () => {
      const provider = new FileSystemPersistenceProvider();
      await expect(provider.readPage("missing")).rejects.toThrow(/does not exist/i);
    });

    it("round-trips a page through a real write + read", async () => {
      const provider = new FileSystemPersistenceProvider();
      const page = makePage({ id: "page-1" });

      await provider.writePage("page-1", page);

      const restarted = new FileSystemPersistenceProvider();
      await expect(restarted.readPage("page-1")).resolves.toEqual(page);
    });

    it("writes pages/<id>.json under Documents/LinNote via temp-then-atomic-rename", async () => {
      const provider = new FileSystemPersistenceProvider();
      await provider.writePage("page-1", makePage({ id: "page-1" }));

      expect(vi.mocked(fsMock.writeTextFile)).toHaveBeenCalledWith(
        "LinNote/pages/page-1.json.tmp",
        expect.any(String),
        { baseDir: 11 },
      );
      expect(vi.mocked(fsMock.rename)).toHaveBeenCalledWith(
        "LinNote/pages/page-1.json.tmp",
        "LinNote/pages/page-1.json",
        { oldPathBaseDir: 11, newPathBaseDir: 11 },
      );
    });

    it("deletePage removes an existing page file", async () => {
      const provider = new FileSystemPersistenceProvider();
      await provider.writePage("page-1", makePage({ id: "page-1" }));

      await provider.deletePage("page-1");

      expect(mockFs.__mockFs.files.has("11:LinNote/pages/page-1.json")).toBe(false);
    });

    it("deletePage on a page that doesn't exist is a no-op, not an error", async () => {
      const provider = new FileSystemPersistenceProvider();
      await expect(provider.deletePage("never-existed")).resolves.toBeUndefined();
    });

    it("reads a pre-NTA-72 bare NotePage (no schemaVersion field) as version 0", async () => {
      const provider = new FileSystemPersistenceProvider();
      const page = makePage({ id: "page-1" });
      mockFs.__mockFs.files.set("11:LinNote/pages/page-1.json", JSON.stringify(page));

      await expect(provider.readPage("page-1")).resolves.toEqual(page);
    });
  });

  describe("assets (NTA-69)", () => {
    it("round-trips binary asset data through a real write + read", async () => {
      const provider = new FileSystemPersistenceProvider();
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const blob = new Blob([bytes]);

      await provider.writeAsset("page-1", "photo.png", blob);
      const readBack = await provider.readAsset("page-1", "photo.png");

      const readBytes = new Uint8Array(await readBack.arrayBuffer());
      expect(Array.from(readBytes)).toEqual(Array.from(bytes));
    });

    it("writes assets/<id>/<name> under Documents/LinNote via temp-then-atomic-rename", async () => {
      const provider = new FileSystemPersistenceProvider();
      await provider.writeAsset("page-1", "photo.png", new Blob([new Uint8Array([1])]));

      expect(vi.mocked(fsMock.writeFile)).toHaveBeenCalledWith(
        "LinNote/assets/page-1/photo.png.tmp",
        expect.any(Uint8Array),
        { baseDir: 11 },
      );
      expect(vi.mocked(fsMock.rename)).toHaveBeenCalledWith(
        "LinNote/assets/page-1/photo.png.tmp",
        "LinNote/assets/page-1/photo.png",
        { oldPathBaseDir: 11, newPathBaseDir: 11 },
      );
    });
  });
});
