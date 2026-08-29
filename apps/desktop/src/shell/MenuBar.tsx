// The rendering half of NTA-11 — takes the `MenuBarModel` built by
// `buildMenuBar` (./index.ts) and renders it as the app's top menu bar.
// One top-level menu open at a time; click-to-toggle, mouse-leave closes.
//
// Command dispatch is the caller's problem, not this component's: it only
// ever calls `onRunCommand(commandId)`. That keeps this file decoupled
// from how commands actually get run (a plugin's own `PluginContext
// .commands.run`, or a shell-wide command bus) — wiring it to the real
// `PluginRegistry` at app startup (NTA-16) shouldn't require touching
// this file.

import { useState } from "react";
import type { MenuBarModel, MenuEntryModel, TopLevelMenu } from "./index";

export interface MenuBarProps {
  model: MenuBarModel;
  onRunCommand: (commandId: string) => void;
}

export function MenuBar({ model, onRunCommand }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<TopLevelMenu | null>(null);

  function runAndClose(commandId: string) {
    onRunCommand(commandId);
    setOpenMenu(null);
  }

  return (
    <nav className="menu-bar" onMouseLeave={() => setOpenMenu(null)}>
      {model.map(({ menu, entries }) => (
        <div key={menu} className="menu-bar__menu">
          <button
            type="button"
            className="menu-bar__trigger"
            aria-expanded={openMenu === menu}
            onClick={() => setOpenMenu((current) => (current === menu ? null : menu))}
          >
            {menu}
          </button>
          {openMenu === menu && (
            <ul className="menu-bar__dropdown" role="menu">
              {entries.map((entry) => (
                <MenuEntryView key={entryKey(entry)} entry={entry} onRunCommand={runAndClose} />
              ))}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}

function MenuEntryView({
  entry,
  onRunCommand,
}: {
  entry: MenuEntryModel;
  onRunCommand: (commandId: string) => void;
}) {
  if (entry.kind === "item") {
    return (
      <li role="none">
        <button
          type="button"
          role="menuitem"
          className="menu-bar__item"
          onClick={() => onRunCommand(entry.item.commandId)}
        >
          {entry.item.label}
        </button>
      </li>
    );
  }

  return (
    <li role="none" className="menu-bar__submenu">
      <span className="menu-bar__submenu-label">{entry.submenu.label}</span>
      <ul role="menu">
        {entry.submenu.items.map((item) => (
          <li key={item.commandId} role="none">
            <button
              type="button"
              role="menuitem"
              className="menu-bar__item"
              onClick={() => onRunCommand(item.commandId)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

function entryKey(entry: MenuEntryModel): string {
  return entry.kind === "item" ? `item:${entry.item.commandId}` : `submenu:${entry.submenu.label}`;
}
