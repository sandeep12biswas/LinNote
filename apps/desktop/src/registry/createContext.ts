// Real PluginContext factory — NTA-15 integration (docs/architecture.md
// §1.2/§1.4). Backs every plugin's activate()/deactivate() with one
// app-wide instance of each ctx service:
//
// - ctx.commands is a single shared CommandBus (below), so a plugin's
//   activate() registering a command and the shell (../shell/) dispatching
//   a click on that command's menu/toolbar entry are reading and writing
//   the exact same table — not two independent, disconnected mocks.
// - ctx.storage is scoped per plugin id (a plugin can only read/write its
//   own namespace, per @linnote/plugin-sdk's PluginContext contract), kept
//   in memory only for now.
// - ctx.menu.addItem / ctx.canvas.registerElementType / ctx.events are
//   functionally real (they record/dispatch) but nothing yet reads
//   menuItems/canvasElementTypes back out: ../shell/'s buildMenuBar and
//   buildToolbar already read `menu`/`toolbar` contributions declaratively
//   off each active plugin's manifest (NTA-11/NTA-12), so no plugin needs
//   to call ctx.menu.addItem imperatively today. It's kept here, real
//   rather than a no-op, for whenever a plugin needs to register a menu
//   item dynamically after activation.
//
// TODO(phase-2+): back ctx.storage with FileSystemPersistenceProvider (or
// a dedicated per-plugin settings file) once a real need for persisted
// plugin-owned state shows up — no ticket has scoped that yet, so this
// stays in-memory (lost on app restart) deliberately, rather than
// half-implementing a persistence shape nobody has designed.

import type { CanvasElementTypeContribution, MenuContribution, PluginContext, PluginId } from "@linnote/plugin-sdk";

export interface CommandBus {
  register: (id: string, fn: (...args: unknown[]) => unknown) => void;
  run: (id: string, ...args: unknown[]) => unknown;
  has: (id: string) => boolean;
}

/**
 * One shared command table for the whole app session. `run` on an
 * unregistered id logs a warning and returns `undefined` rather than
 * throwing — a stale/missing command shouldn't crash whatever's dispatching
 * it (the shell's menu/toolbar click handler, most likely).
 */
export function createCommandBus(): CommandBus {
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  return {
    register: (id, fn) => {
      commands.set(id, fn);
    },
    run: (id, ...args) => {
      const fn = commands.get(id);
      if (!fn) {
        console.warn(`PluginContext command bus: no command registered for "${id}"`);
        return undefined;
      }
      return fn(...args);
    },
    has: (id) => commands.has(id),
  };
}

export interface ContextFactoryOptions {
  /** Shared across every plugin's ctx.commands — see module docs above. */
  commandBus: CommandBus;
}

/**
 * Builds the `(pluginId) => PluginContext` factory `PluginRegistry` needs
 * (`PluginRegistryOptions.createContext`, ../registry/index.ts) — the real,
 * app-wide counterpart to `@linnote/plugin-playground`'s
 * `createMockContext` (which logs to the console for isolated single-plugin
 * development instead of touching a real registry).
 */
export function createPluginContextFactory(options: ContextFactoryOptions): (pluginId: PluginId) => PluginContext {
  const menuItems: MenuContribution[] = [];
  const canvasElementTypes: CanvasElementTypeContribution[] = [];
  const eventHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
  const storageByPlugin = new Map<PluginId, Map<string, unknown>>();

  return (pluginId: PluginId): PluginContext => {
    let pluginStorage = storageByPlugin.get(pluginId);
    if (!pluginStorage) {
      pluginStorage = new Map<string, unknown>();
      storageByPlugin.set(pluginId, pluginStorage);
    }
    const storage = pluginStorage;

    return {
      commands: {
        register: options.commandBus.register,
        run: options.commandBus.run,
      },
      menu: {
        addItem: (contribution) => {
          menuItems.push(contribution);
        },
      },
      canvas: {
        registerElementType: (contribution) => {
          canvasElementTypes.push(contribution);
        },
      },
      storage: {
        get: async <T,>(key: string) => storage.get(key) as T | undefined,
        set: async <T,>(key: string, value: T) => {
          storage.set(key, value);
        },
      },
      events: {
        on: (event, handler) => {
          const list = eventHandlers.get(event) ?? [];
          list.push(handler);
          eventHandlers.set(event, list);
        },
        emit: (event, ...args) => {
          for (const handler of eventHandlers.get(event) ?? []) handler(...args);
        },
      },
    };
  };
}
