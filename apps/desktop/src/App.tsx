// NTA-15 — integration: builds the one real `PluginRegistry` for the app
// session (docs/architecture.md §1.4, §9 Phase 1), activates all 15
// core.* plugins against it (format-*, element-*, sync-*; deliberately not
// `core.settings.plugins` — the story's acceptance criteria counts these
// 15), and renders `AppShell` (./shell/) off the registry's live state.
// `core.settings.plugins` still has nowhere to render into (no Settings UI
// shell exists yet) — `AppShell`'s `PluginsStatusPanel` is the minimal
// "Settings > Plugins" stand-in this story's acceptance criteria needs.
//
// NTA-38 also passes `commandBus` itself down to `AppShell` (not just the
// `runCommand` wrapper below) — canvas-core/SegmentLayerHost.tsx needs
// direct `register`/`unregister` access to install a real, page-aware
// command handler over a plugin's activate()-time fallback; see that
// file's and registry/createContext.ts's header comments.

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./shell";
import { createNotePageAutosave } from "./canvas-core";
import { PluginRegistry, createCommandBus, createPluginContextFactory } from "./registry";
import type { RegisteredPlugin } from "./registry";
import { defaultPersistenceProvider } from "./persistence";
import { wireHardFlushOnClose } from "./persistence/autosave";
import { loadWorkspaceTree, wireWorkspaceTreeAutosave } from "./workspace";
import "./App.css";

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

// The 15 core.* plugins NTA-15 proves activate end-to-end (its own
// description enumerates exactly this set) — docs/architecture.md §9
// Phase 1.
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

function App() {
  // One PluginRegistry + one CommandBus + one NotePage autosave
  // controller per app session (docs/architecture.md §1.2/§6) — useMemo
  // with an empty dep array, not useState, since none of the three is
  // ever replaced, only acted on.
  const { registry, commandBus, notePageAutosave } = useMemo(() => {
    const bus = createCommandBus();
    return {
      commandBus: bus,
      registry: new PluginRegistry(CORE_PLUGINS, {
        settingsPersistence: defaultPersistenceProvider,
        createContext: createPluginContextFactory({ commandBus: bus }),
      }),
      notePageAutosave: createNotePageAutosave(defaultPersistenceProvider),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [registeredPlugins, setRegisteredPlugins] = useState<RegisteredPlugin[]>([]);
  const [activated, setActivated] = useState(false);

  // NTA-15's plugin activation and NTA-69's workspace-tree load both
  // gate the same "Loading plugins…" screen — loading the tree
  // *after* first render would show the in-memory seed default, then
  // flash to whatever's actually persisted a moment later.
  useEffect(() => {
    let cancelled = false;
    Promise.all([registry.activateAll(), loadWorkspaceTree(defaultPersistenceProvider)]).then(() => {
      if (cancelled) return;
      setRegisteredPlugins(registry.list());
      setActivated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [registry]);

  // NTA-70: tree mutations flush immediately; page edits debounce
  // (~800ms) via `notePageAutosave`, with a hard flush on window
  // close/blur so nothing is lost to an in-flight debounce timer.
  useEffect(() => {
    const unsubscribeTree = wireWorkspaceTreeAutosave(defaultPersistenceProvider);
    const unsubscribePages = notePageAutosave.wire();
    let unlistenClose: (() => void) | undefined;
    wireHardFlushOnClose(notePageAutosave)
      .then((unlisten) => {
        unlistenClose = unlisten;
      })
      .catch((error) => {
        // `getCurrentWindow()` needs a real Tauri window context — found
        // missing this catch by actually driving the app in a plain
        // browser (this session's own headless-Chromium + mocked-IPC
        // setup, not a real Tauri window), where it rejects and would
        // otherwise surface as an unhandled promise rejection.
        console.error("[autosave] failed to wire hard-flush-on-close", error);
      });
    return () => {
      unsubscribeTree();
      unsubscribePages();
      unlistenClose?.();
    };
  }, [notePageAutosave]);

  function runCommand(commandId: string) {
    commandBus.run(commandId);
  }

  if (!activated) {
    return <div className="app-shell app-shell--loading">Loading plugins…</div>;
  }

  return <AppShell registeredPlugins={registeredPlugins} onRunCommand={runCommand} commandBus={commandBus} />;
}

export default App;
