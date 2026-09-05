// The plugin contract. Every plugin in plugins/*, and the registry in
// apps/desktop/src/registry/, build against this file and nothing else —
// per Desing architecture §3.1: "Plugins never import each other's
// internals." This is the one package every plugin package is allowed to
// depend on unconditionally; any other cross-plugin dependency must be
// declared explicitly in that plugin's own `dependencies` (Desing
// architecture §3.1, enforced at build time per Plugins §7).
//
// TODO(phase-1): flesh out PluginContext's real service surface
// (ctx.commands, ctx.menu, ctx.canvas, ctx.storage, ctx.events) as the
// registry (apps/desktop/src/registry/) is implemented.

export type PluginId = string; // namespaced, e.g. "core.format.font-color"

export interface MenuContribution {
  menu: "File" | "Edit" | "Tool" | "View" | "Format" | "Window" | "Help";
  label: string;
  commandId: string;
  submenu?: string;
  priority?: number;
}

export interface ToolbarContribution {
  label: string;
  icon?: string;
  commandId: string;
  priority?: number;
}

export interface FormatCommandContribution {
  id: string; // e.g. "applyBold", "setFontColor"
  label: string;
  run: (ctx: PluginContext, ...args: unknown[]) => void;
}

export interface CanvasElementTypeContribution {
  type: string; // e.g. "ink", "segment", "file-attachment", "youtube-embed"
  // TODO(phase-3/7/9/10): renderer + optional insert command, once
  // canvas-core (apps/desktop/src/canvas-core/) defines the render contract.
}

export interface SyncProviderContribution {
  id: string; // e.g. "core.sync.onedrive"
  // TODO(phase-10): matches the SyncProvider interface in
  // Desing architecture §16 (authenticate/upload/download/listChanges/
  // resolveConflict).
}

export interface FileHandlerContribution {
  extension: string; // e.g. "docx" — matched case-insensitively against FileAttachment.extension
  label: string; // e.g. "Preview with Office" — shown in a future "Open with" UI
  /**
   * Looked up on the shared `CommandBus` (../registry/createContext.ts,
   * threaded through the same commandId indirection `MenuContribution`/
   * `ToolbarContribution` already use, not an inline function) and run
   * with the attachment as its argument in place of core.element.
   * file-attachment's own default "open externally" behavior (NTA-45,
   * §10.1) — lets a future plugin (e.g. an Office previewer) layer a
   * per-extension handler on top of core.element.file-attachment without
   * modifying it.
   */
  commandId: string;
}

export interface SettingsPanelContribution {
  id: string;
  label: string;
  // TODO: render function, once the Settings UI shell exists.
}

export interface PluginManifest {
  id: PluginId;
  name: string;
  version: string; // semver
  /** pluginId -> semver range. MUST be explicit, never implicit. */
  dependencies?: Record<string, string>;
  contributes: {
    menu?: MenuContribution[];
    toolbar?: ToolbarContribution[];
    formatCommands?: FormatCommandContribution[];
    canvasElementTypes?: CanvasElementTypeContribution[];
    syncProviders?: SyncProviderContribution[];
    fileHandlers?: FileHandlerContribution[];
    settingsPanels?: SettingsPanelContribution[];
  };
}

/**
 * Narrow, versioned API surface handed to a plugin's activate()/deactivate().
 * A plugin reaches every other plugin's capability only through here —
 * never via a source import of another plugins/* package.
 */
export interface PluginContext {
  commands: {
    register: (id: string, fn: (...args: unknown[]) => unknown) => void;
    run: (id: string, ...args: unknown[]) => unknown;
  };
  menu: {
    addItem: (contribution: MenuContribution) => void;
  };
  canvas: {
    registerElementType: (contribution: CanvasElementTypeContribution) => void;
  };
  /** Scoped per-plugin-id — a plugin can only read/write its own namespace. */
  storage: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: <T>(key: string, value: T) => Promise<void>;
  };
  events: {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
  };
}

export interface Plugin {
  manifest: PluginManifest;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(ctx: PluginContext): void | Promise<void>;
}
