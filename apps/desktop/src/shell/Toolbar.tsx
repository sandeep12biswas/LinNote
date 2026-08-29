// The rendering half of NTA-12 — takes the `ToolbarModel` built by
// `buildToolbar` (./index.ts) and renders it as the app's toolbar: one
// button per contribution, in priority order.
//
// Command dispatch is the caller's problem, not this component's: it only
// ever calls `onRunCommand(commandId)`, mirroring `MenuBar.tsx`'s
// decoupling from how commands actually get run (a plugin's own
// `PluginContext.commands.run`, or a shell-wide command bus). Wiring this
// to the real `PluginRegistry` at app startup is NTA-16 (integration) —
// out of scope here.

import type { ToolbarModel } from "./index";

export interface ToolbarProps {
  model: ToolbarModel;
  onRunCommand: (commandId: string) => void;
}

export function Toolbar({ model, onRunCommand }: ToolbarProps) {
  return (
    <div className="toolbar" role="toolbar">
      {model.map((button) => (
        <button
          key={button.commandId}
          type="button"
          className="toolbar__button"
          title={button.label}
          aria-label={button.label}
          onClick={() => onRunCommand(button.commandId)}
        >
          {button.icon && <span className="toolbar__icon">{button.icon}</span>}
          <span className="toolbar__label">{button.label}</span>
        </button>
      ))}
    </div>
  );
}
