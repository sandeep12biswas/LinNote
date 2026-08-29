// NTA-13 — the composed 4-region app shell layout (docs/architecture.md
// §2): menu bar and toolbar stacked on top, with a Folder Tree / Page
// List / Editor Canvas three-pane split filling the rest of the window.
// Wraps `MenuBar` (./MenuBar.tsx) and `Toolbar` (./Toolbar.tsx) around
// static placeholder panes — real `WorkspaceNode` tree data for the
// Folder Tree and Page List panes (../persistence/) is phase-2, not this
// ticket. "Window scope (decided)" per §2: single page open at a time, no
// tab strip, no multi-window model — the Editor Canvas pane below is a
// single static placeholder, not a tab strip.
//
// NTA-15 (integration): `registeredPlugins`/`onRunCommand` now come from a
// real, activated `PluginRegistry` (../App.tsx owns building it) instead
// of a hardcoded empty list and a console.log stub — the menu bar/toolbar
// regions render whatever the active plugins actually contribute, and a
// click really runs that plugin's registered command via the shared
// command bus (../registry/createContext.ts). `PluginsStatusPanel` below
// is the minimal "Settings > Plugins" stand-in described there.

import { buildMenuBar, buildToolbar } from "./index";
import { MenuBar } from "./MenuBar";
import { Toolbar } from "./Toolbar";
import { PluginsStatusPanel } from "./PluginsStatusPanel";
import type { RegisteredPlugin } from "../registry";

export interface AppShellProps {
  registeredPlugins: RegisteredPlugin[];
  onRunCommand: (commandId: string) => void;
}

export function AppShell({ registeredPlugins, onRunCommand }: AppShellProps) {
  const menuBarModel = buildMenuBar(registeredPlugins);
  const toolbarModel = buildToolbar(registeredPlugins);

  return (
    <div className="app-shell">
      <MenuBar model={menuBarModel} onRunCommand={onRunCommand} />
      <Toolbar model={toolbarModel} onRunCommand={onRunCommand} />
      <div className="app-shell__main">
        <section className="app-shell__pane app-shell__pane--folder-tree" aria-label="Folder Tree">
          <h2 className="app-shell__pane-label">Folder Tree</h2>
        </section>
        <section className="app-shell__pane app-shell__pane--page-list" aria-label="Page List">
          <h2 className="app-shell__pane-label">Page List</h2>
        </section>
        <section className="app-shell__pane app-shell__pane--editor-canvas" aria-label="Editor Canvas">
          <h2 className="app-shell__pane-label">Editor Canvas</h2>
        </section>
      </div>
      <PluginsStatusPanel registeredPlugins={registeredPlugins} />
    </div>
  );
}
