import { beforeEach, describe, expect, it, vi } from "vitest";

// `@tauri-apps/plugin-fs` only exists inside a real Tauri runtime, so we
// fake it with an in-memory filesystem keyed by "<baseDir>:<path>" — real
// enough to exercise read/write/exists/rename/mkdir semantics (including
// atomic-rename-over-an-existing-file) without a webview or an OS.
vi.mock("@tauri-apps/plugin-fs", () => {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const key = (path: string, baseDir: unknown) => `${String(baseDir)}:${path}`;

  return {
    BaseDirectory: { AppConfig: 13 },
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
        files.set(newKey, files.get(oldKey) as string);
        files.delete(oldKey);
      },
    ),
    remove: vi.fn(async (path: string, opts: { baseDir: unknown }) => {
      files.delete(key(path, opts.baseDir));
    }),
  };
});

import * as fsMock from "@tauri-apps/plugin-fs";
import type { PluginSettingsStore } from "./index";
import { FileSystemPersistenceProvider } from "./index";

// The escape hatch declared inside the mock factory above, typed loosely
// since it's test-only.
const mockFs = fsMock as unknown as {
  __mockFs: { files: Map<string, string>; dirs: Set<string> };
};

describe("FileSystemPersistenceProvider", () => {
  beforeEach(() => {
    mockFs.__mockFs.files.clear();
    mockFs.__mockFs.dirs.clear();
    vi.clearAllMocks();
  });

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
    await provider.writePluginSettings({ "a": { enabled: true, settings: null } });
    await provider.writePluginSettings({ "a": { enabled: false, settings: { x: 1 } } });

    await expect(provider.readPluginSettings()).resolves.toEqual({
      a: { enabled: false, settings: { x: 1 } },
    });
  });

  it("ensures the app config directory exists before writing", async () => {
    const provider = new FileSystemPersistenceProvider();
    await provider.writePluginSettings({});

    expect(vi.mocked(fsMock.mkdir)).toHaveBeenCalledWith(
      ".",
      expect.objectContaining({ recursive: true }),
    );
  });

  describe("methods out of scope for NTA-14 (Phase 8 work)", () => {
    const provider = new FileSystemPersistenceProvider();

    it("readTree throws a clear not-implemented error", async () => {
      await expect(provider.readTree()).rejects.toThrow(/not implemented/i);
    });

    it("writeTree throws a clear not-implemented error", async () => {
      await expect(provider.writeTree([])).rejects.toThrow(/not implemented/i);
    });

    it("readPage throws a clear not-implemented error", async () => {
      await expect(provider.readPage("id")).rejects.toThrow(/not implemented/i);
    });

    it("writePage throws a clear not-implemented error", async () => {
      await expect(
        provider.writePage("id", {
          id: "id",
          header: { title: "t", align: "left" },
          background: { kind: "color", color: "#fff" },
          elements: [],
          createdAt: "",
          updatedAt: "",
        }),
      ).rejects.toThrow(/not implemented/i);
    });

    it("deletePage throws a clear not-implemented error", async () => {
      await expect(provider.deletePage("id")).rejects.toThrow(/not implemented/i);
    });

    it("readAsset throws a clear not-implemented error", async () => {
      await expect(provider.readAsset("id", "name")).rejects.toThrow(/not implemented/i);
    });

    it("writeAsset throws a clear not-implemented error", async () => {
      await expect(provider.writeAsset("id", "name", new Blob())).rejects.toThrow(/not implemented/i);
    });
  });
});
