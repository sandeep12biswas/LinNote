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
// NTA-33 mounts `CanvasViewport` (../canvas-core/) into the Editor Canvas
// pane in place of its static placeholder, once a page is open
// (`useNavigationStore`'s `activePageId` — ../store/). NOTE: this file
// currently reflects this worktree's own base commit, which predates
// NTA-49/50/51/55's live Folder Tree/Page List panes and
// `<BreadcrumbTrail />` — see this story's final report for why; wire
// `<BreadcrumbTrail />` back in above `<CanvasViewport>` (inside the
// same pane, outside CanvasViewport's `header` slot is also fine) when
// this merges with that work.

import { CanvasViewport } from "../canvas-core";
import { useNavigationStore } from "../store";
import { buildMenuBar, buildToolbar } from "./index";
import { MenuBar } from "./MenuBar";
import { Toolbar } from "./Toolbar";

export function AppShell() {
  // TODO(phase-1): there's no live PluginRegistry wired up yet (NTA-16),
  // so these are built from an empty plugin list — the menu bar/toolbar
  // regions render correctly positioned but with no items until NTA-16
  // threads a real, populated `RegisteredPlugin[]` through here.
  const menuBarModel = buildMenuBar([]);
  const toolbarModel = buildToolbar([]);

  const activePageId = useNavigationStore((state) => state.activePageId);

  // No command bus exists yet either (also NTA-16) — this stub just logs
  // so `onRunCommand` has somewhere real to go for now.
  function runCommand(commandId: string) {
    console.log(`TODO(phase-1, NTA-16): dispatch command "${commandId}"`);
  }

  return (
    <div className="app-shell">
      <MenuBar model={menuBarModel} onRunCommand={runCommand} />
      <Toolbar model={toolbarModel} onRunCommand={runCommand} />
      <div className="app-shell__main">
        <section className="app-shell__pane app-shell__pane--folder-tree" aria-label="Folder Tree">
          <h2 className="app-shell__pane-label">Folder Tree</h2>
        </section>
        <section className="app-shell__pane app-shell__pane--page-list" aria-label="Page List">
          <h2 className="app-shell__pane-label">Page List</h2>
        </section>
        <section className="app-shell__pane app-shell__pane--editor-canvas" aria-label="Editor Canvas">
          {activePageId ? (
            <CanvasViewport pageId={activePageId} />
          ) : (
            <h2 className="app-shell__pane-label">Editor Canvas</h2>
          )}
        </section>
      </div>
    </div>
  );
}
