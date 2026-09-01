// NTA-13 — the composed 4-region app shell layout (docs/architecture.md
// §2): menu bar and toolbar stacked on top, with a Folder Tree / Page
// List / Editor Canvas three-pane split filling the rest of the window.
// Wraps `MenuBar` (./MenuBar.tsx) and `Toolbar` (./Toolbar.tsx) around
// the panes. "Window scope (decided)" per §2: single page open at a
// time, no tab strip, no multi-window model.
//
// NTA-15 (integration): `registeredPlugins`/`onRunCommand` now come from a
// real, activated `PluginRegistry` (../App.tsx owns building it) instead
// of a hardcoded empty list and a console.log stub — the menu bar/toolbar
// regions render whatever the active plugins actually contribute, and a
// click really runs that plugin's registered command via the shared
// command bus (../registry/createContext.ts). `PluginsStatusPanel` below
// is the minimal "Settings > Plugins" stand-in described there.
//
// NTA-49/50/51 replace what used to be static Folder Tree / Page List
// placeholder panes with `FolderTreePane`/`PageListPane`
// (./FolderTreePane.tsx, ./PageListPane.tsx), backed by the in-memory
// `WorkspaceNode` tree store (../workspace/).
//
// NTA-55 adds `BreadcrumbTrail` (./BreadcrumbTrail.tsx) above the Editor
// Canvas pane's own content — "notebook > folder > ... > page" for
// whichever page is currently open (../store's `activePageId`), each
// segment clickable. It renders nothing when no page is open.
//
// NTA-54: a "Trash" toggle next to the Folder Tree pane's label opens
// `TrashPane` (./TrashPane.tsx) as an overlay above the pane split —
// structural, not a plugin contribution, so it lives here rather than
// going through the menu bar's registry-driven contributions.
//
// NTA-56: `FolderTreePane`/`PageListPane` now virtualize their row
// rendering internally (see their own doc comments); `SearchBox`
// (./SearchBox.tsx) is new here, giving the incremental search index
// (../search/) a place in the running app.
//
// NTA-33 mounts `CanvasViewport` (../canvas-core/) into the Editor Canvas
// pane once a page is open (`useNavigationStore`'s `activePageId`),
// replacing the static placeholder that was there since NTA-13; falls
// back to the placeholder when no page is open.
//
// NTA-37 mounts `SegmentLayerHost` (../canvas-core/SegmentLayerHost.tsx)
// as `CanvasViewport`'s `children` — the segment-block renderer and
// invisible create-on-type gesture, panning/scaling with the page's
// other content.
//
// NTA-34 mounts `PageHeader` (../canvas-core/PageHeader.tsx) as
// `CanvasViewport`'s `header` prop — title/date/alignment, fixed on
// screen outside the pan/zoom transform.

import { useState } from "react";
import { CanvasViewport, PageHeader, SegmentLayerHost } from "../canvas-core";
import { useNavigationStore } from "../store";
import { buildMenuBar, buildToolbar } from "./index";
import { MenuBar } from "./MenuBar";
import { Toolbar } from "./Toolbar";
import { PluginsStatusPanel } from "./PluginsStatusPanel";
import { FolderTreePane } from "./FolderTreePane";
import { PageListPane } from "./PageListPane";
import { BreadcrumbTrail } from "./BreadcrumbTrail";
import { TrashPane } from "./TrashPane";
import { SearchBox } from "./SearchBox";
import type { RegisteredPlugin } from "../registry";

export interface AppShellProps {
  registeredPlugins: RegisteredPlugin[];
  onRunCommand: (commandId: string) => void;
}

export function AppShell({ registeredPlugins, onRunCommand }: AppShellProps) {
  const menuBarModel = buildMenuBar(registeredPlugins);
  const toolbarModel = buildToolbar(registeredPlugins);
  const [trashOpen, setTrashOpen] = useState(false);
  const activePageId = useNavigationStore((state) => state.activePageId);

  return (
    <div className="app-shell">
      <MenuBar model={menuBarModel} onRunCommand={onRunCommand} />
      <Toolbar model={toolbarModel} onRunCommand={onRunCommand} />
      <SearchBox />
      <div className="app-shell__main">
        <section className="app-shell__pane app-shell__pane--folder-tree" aria-label="Folder Tree">
          <div className="app-shell__pane-header">
            <h2 className="app-shell__pane-label">Folder Tree</h2>
            <button type="button" className="app-shell__trash-toggle" onClick={() => setTrashOpen(true)}>
              Trash
            </button>
          </div>
          <FolderTreePane />
        </section>
        <section className="app-shell__pane app-shell__pane--page-list" aria-label="Page List">
          <h2 className="app-shell__pane-label">Page List</h2>
          <PageListPane />
        </section>
        <section className="app-shell__pane app-shell__pane--editor-canvas" aria-label="Editor Canvas">
          <BreadcrumbTrail />
          {activePageId ? (
            <CanvasViewport pageId={activePageId} header={<PageHeader pageId={activePageId} />}>
              <SegmentLayerHost pageId={activePageId} />
            </CanvasViewport>
          ) : (
            <h2 className="app-shell__pane-label">Editor Canvas</h2>
          )}
        </section>
      </div>
      <PluginsStatusPanel registeredPlugins={registeredPlugins} />
      {trashOpen && <TrashPane onClose={() => setTrashOpen(false)} />}
    </div>
  );
}
