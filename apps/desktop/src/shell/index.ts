// App shell — docs/architecture.md §4: menu bar, toolbar, and the 4-region
// layout (menu | toolbar | Folder Tree pane | Page List pane | Editor
// Canvas pane). Renders `menu`/`toolbar` contributions from the registry
// (../registry/), grouped and sorted per §4.1; the Folder Tree and Page
// List panes read from the WorkspaceNode tree (../../types#WorkspaceNode)
// via ../persistence/.
//
// This file implements NTA-11 (menu bar rendering): `buildMenuBar` below
// is a pure function — grouping/sorting/nesting `MenuContribution`s from
// the registry's *activated* plugins into a render-ready model — kept
// separate from `MenuBar` (./MenuBar.tsx), the React component that
// renders that model. Wiring real `plugins/*` packages into a running
// `PluginRegistry` at app startup, and mounting `<MenuBar>` off it inside
// `App.tsx`, is NTA-16 (integration) — this ticket only has to guarantee
// that whatever active plugins' `menu` contributions it's handed come out
// correctly grouped, ordered, and nested.
//
// NTA-12 (toolbar rendering) adds `buildToolbar` below, mirroring
// `buildMenuBar`'s sort convention but simpler: `ToolbarContribution`
// (unlike `MenuContribution`) has no top-level-menu grouping and no
// submenu nesting, so it's just active plugins' `toolbar` contributions
// sorted by `priority` (undeclared last, ties in activation order).
//
// NTA-13 (static 4-region layout) adds `AppShell` (./AppShell.tsx), which
// composes `MenuBar` and `Toolbar` with static Folder Tree / Page List /
// Editor Canvas placeholder panes into the full layout from §2 — `App.tsx`
// just renders it.
//
// NTA-15 (integration) wires a real, activated `PluginRegistry` (built in
// ../App.tsx) into `AppShell` — `buildMenuBar`/`buildToolbar` above now run
// against real active plugins instead of an empty list — and adds
// `PluginsStatusPanel` (./PluginsStatusPanel.tsx), the minimal
// "Settings > Plugins" stand-in the story's acceptance criteria needs.
//
// NTA-49/50/51 add the real Folder Tree / Page List panes: `buildFolderTree`
// (./folderTree.ts) + `FolderTreePane` (./FolderTreePane.tsx) render the
// notebook/folder subset of the tree with expand/collapse, drag-to-reparent,
// and a rename/move/delete/new-folder context menu; `buildPageList`
// (./pageList.ts) + `PageListPane` (./PageListPane.tsx) list the selected
// folder's pages with subpages nested. Both read/write the in-memory
// `WorkspaceNode` tree store in ../workspace/ (NTA-49).
//
// NTA-55 adds the breadcrumb trail above the editor canvas:
// `buildBreadcrumb` (./breadcrumb.ts) + `BreadcrumbTrail`
// (./BreadcrumbTrail.tsx) turn the open page's ancestor chain
// (../workspace's `getAncestorChain`) into a clickable "notebook >
// folder > ... > page" trail, mirroring the same pure-model /
// React-component split.
//
// TODO(NTA-52/53/54): structural-operation undo stack, same-parent
// fractional-index drag-reorder polish, and a trash UI are separate
// subtasks of the same parent story (NTA-43) — not built here.

import type { MenuContribution, ToolbarContribution } from "@linnote/plugin-sdk";
import type { RegisteredPlugin } from "../registry";

/** Canonical left-to-right order of the app's top-level menus (docs/architecture.md §2). */
export const TOP_LEVEL_MENUS = ["File", "Edit", "Tool", "View", "Format", "Window", "Help"] as const;

export type TopLevelMenu = (typeof TOP_LEVEL_MENUS)[number];

export interface MenuItemModel {
  label: string;
  commandId: string;
}

export interface SubmenuModel {
  label: string;
  items: MenuItemModel[];
}

/** One entry directly under a top-level menu: either a leaf item or a nested submenu. */
export type MenuEntryModel = { kind: "item"; item: MenuItemModel } | { kind: "submenu"; submenu: SubmenuModel };

export interface TopMenuModel {
  menu: TopLevelMenu;
  entries: MenuEntryModel[];
}

export type MenuBarModel = TopMenuModel[];

/** Undeclared `priority` sorts after every declared one, ties kept in activation order. */
const UNDECLARED_PRIORITY = Number.POSITIVE_INFINITY;

/**
 * Groups `menu` contributions from every *active* plugin (§1.2's isolated
 * failure handling means a `disabled`/`failed` plugin's contributions
 * never reach the shell) by their declared top-level menu, sorts each
 * group — and each submenu within it — by `priority` (undeclared last,
 * ties stable in activation order), and nests `submenu`-tagged items
 * under a synthetic `SubmenuModel` positioned by its own items' lowest
 * priority.
 *
 * Top-level menus with no active contributions are omitted entirely, but
 * the ones that do appear stay in `TOP_LEVEL_MENUS` order regardless of
 * which plugin activated first.
 */
export function buildMenuBar(registeredPlugins: RegisteredPlugin[]): MenuBarModel {
  const contributions = registeredPlugins
    .filter((rp) => rp.state === "active")
    .flatMap((rp) => rp.plugin.manifest.contributes.menu ?? []);

  const byMenu = new Map<TopLevelMenu, MenuContribution[]>();
  for (const contribution of contributions) {
    const list = byMenu.get(contribution.menu) ?? [];
    list.push(contribution);
    byMenu.set(contribution.menu, list);
  }

  const result: MenuBarModel = [];
  for (const menu of TOP_LEVEL_MENUS) {
    const forMenu = byMenu.get(menu);
    if (!forMenu || forMenu.length === 0) continue;
    result.push({ menu, entries: buildEntries(forMenu) });
  }
  return result;
}

function buildEntries(contributions: MenuContribution[]): MenuEntryModel[] {
  const submenus = new Map<string, MenuContribution[]>();
  const directItems: MenuContribution[] = [];

  for (const contribution of contributions) {
    if (contribution.submenu) {
      const list = submenus.get(contribution.submenu) ?? [];
      list.push(contribution);
      submenus.set(contribution.submenu, list);
    } else {
      directItems.push(contribution);
    }
  }

  const pending: Array<{ sortKey: number; entry: MenuEntryModel }> = [];

  for (const contribution of directItems) {
    pending.push({
      sortKey: contribution.priority ?? UNDECLARED_PRIORITY,
      entry: { kind: "item", item: { label: contribution.label, commandId: contribution.commandId } },
    });
  }

  for (const [label, items] of submenus) {
    pending.push({
      sortKey: Math.min(...items.map((item) => item.priority ?? UNDECLARED_PRIORITY)),
      entry: {
        kind: "submenu",
        submenu: {
          label,
          items: [...items].sort(byPriority).map((item) => ({ label: item.label, commandId: item.commandId })),
        },
      },
    });
  }

  // Array.prototype.sort is stable (ES2019+), so equal-priority entries
  // keep their activation order.
  return pending.sort((a, b) => a.sortKey - b.sortKey).map((p) => p.entry);
}

function byPriority(a: MenuContribution, b: MenuContribution): number {
  return (a.priority ?? UNDECLARED_PRIORITY) - (b.priority ?? UNDECLARED_PRIORITY);
}

export interface ToolbarButtonModel {
  label: string;
  icon?: string;
  commandId: string;
}

export type ToolbarModel = ToolbarButtonModel[];

/**
 * Flattens `toolbar` contributions from every *active* plugin (§1.2's
 * isolated failure handling means a `disabled`/`failed` plugin's
 * contributions never reach the shell) into a single button list, sorted
 * by `priority` (undeclared last, ties stable in activation order).
 * Unlike `buildMenuBar`, there's no top-level grouping or submenu
 * nesting — `ToolbarContribution` doesn't declare either.
 */
export function buildToolbar(registeredPlugins: RegisteredPlugin[]): ToolbarModel {
  const contributions = registeredPlugins
    .filter((rp) => rp.state === "active")
    .flatMap((rp) => rp.plugin.manifest.contributes.toolbar ?? []);

  // Array.prototype.sort is stable (ES2019+), so equal-priority
  // contributions keep their activation order.
  return [...contributions]
    .sort((a, b) => (a.priority ?? UNDECLARED_PRIORITY) - (b.priority ?? UNDECLARED_PRIORITY))
    .map(toButtonModel);
}

function toButtonModel(contribution: ToolbarContribution): ToolbarButtonModel {
  return { label: contribution.label, icon: contribution.icon, commandId: contribution.commandId };
}

export { MenuBar } from "./MenuBar";
export type { MenuBarProps } from "./MenuBar";
export { Toolbar } from "./Toolbar";
export type { ToolbarProps } from "./Toolbar";
export { AppShell } from "./AppShell";
export type { AppShellProps } from "./AppShell";
export { PluginsStatusPanel } from "./PluginsStatusPanel";
export type { PluginsStatusPanelProps } from "./PluginsStatusPanel";
export { FolderTreePane } from "./FolderTreePane";
export { buildFolderTree, canReparent } from "./folderTree";
export type { FolderTreeRow } from "./folderTree";
export { PageListPane } from "./PageListPane";
export { buildPageList } from "./pageList";
export type { PageListRow } from "./pageList";
export { BreadcrumbTrail } from "./BreadcrumbTrail";
export { buildBreadcrumb } from "./breadcrumb";
export type { BreadcrumbSegment } from "./breadcrumb";
