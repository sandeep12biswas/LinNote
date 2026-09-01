// Minimal "Settings > Plugins" stand-in for NTA-15's acceptance criteria
// ("all 15 plugins report active in the Settings > Plugins panel") — not a
// real Settings UI shell. `plugins/settings-plugins-panel`
// (`core.settings.plugins`) already declares the `settingsPanels`
// contribution this would eventually render, but its own comment notes it
// "waits on a Settings UI shell that doesn't exist in any ticket yet" —
// building that full shell (tabs/routing/multiple panels) is out of scope
// here. This lists every registered plugin's id/name and its
// active/disabled/failed state, always visible, so the app itself is
// evidence the registry really activated everything.

import type { RegisteredPlugin } from "../registry";

export interface PluginsStatusPanelProps {
  registeredPlugins: RegisteredPlugin[];
}

export function PluginsStatusPanel({ registeredPlugins }: PluginsStatusPanelProps) {
  return (
    <section className="plugins-status-panel" aria-label="Settings > Plugins">
      <h2 className="plugins-status-panel__title">Settings &gt; Plugins</h2>
      <ul className="plugins-status-panel__list">
        {registeredPlugins.map(({ plugin, state }) => (
          <li
            key={plugin.manifest.id}
            className={`plugins-status-panel__item plugins-status-panel__item--${state}`}
          >
            <span className="plugins-status-panel__name">{plugin.manifest.name}</span>
            <span className="plugins-status-panel__id">{plugin.manifest.id}</span>
            <span className="plugins-status-panel__state">{state}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
