// NTA-15 — integration: builds the one real `PluginRegistry` for the app
// session (docs/architecture.md §1.4, §9 Phase 1), activates all 15
// core.* plugins against it (format-*, element-*, sync-*; deliberately not
// `core.settings.plugins` — the story's acceptance criteria counts these
// 15), and renders `AppShell` (./shell/) off the registry's live state.
// `core.settings.plugins` still has nowhere to render into (no Settings UI
// shell exists yet) — `AppShell`'s `PluginsStatusPanel` is the minimal
// "Settings > Plugins" stand-in this story's acceptance criteria needs.

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./shell";
import { PluginRegistry, createCommandBus, createPluginContextFactory } from "./registry";
import type { RegisteredPlugin } from "./registry";
import { FileSystemPersistenceProvider } from "./persistence";
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
  // One PluginRegistry + one CommandBus per app session (docs/architecture.md
  // §1.2) — useMemo with an empty dep array, not useState, since neither is
  // ever replaced, only acted on.
  const { registry, commandBus } = useMemo(() => {
    const bus = createCommandBus();
    return {
      commandBus: bus,
      registry: new PluginRegistry(CORE_PLUGINS, {
        settingsPersistence: new FileSystemPersistenceProvider(),
        createContext: createPluginContextFactory({ commandBus: bus }),
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [registeredPlugins, setRegisteredPlugins] = useState<RegisteredPlugin[]>([]);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    registry.activateAll().then(() => {
      if (cancelled) return;
      setRegisteredPlugins(registry.list());
      setActivated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [registry]);

  function runCommand(commandId: string) {
    commandBus.run(commandId);
  }

  if (!activated) {
    return <div className="app-shell app-shell--loading">Loading plugins…</div>;
  }

  return <AppShell registeredPlugins={registeredPlugins} onRunCommand={runCommand} />;
}

export default App;
