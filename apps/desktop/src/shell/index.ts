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
// TODO(phase-1): toolbar contribution rendering (mirrors buildMenuBar's
// grouping/sorting approach, once a ToolbarContribution consumer exists).
// TODO(phase-2): Folder Tree pane + Page List pane (§4.1, §5.4), fractional
// -index drag-to-reorder, breadcrumb trail.

import type { MenuContribution } from "@linnote/plugin-sdk";
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

export { MenuBar } from "./MenuBar";
export type { MenuBarProps } from "./MenuBar";
