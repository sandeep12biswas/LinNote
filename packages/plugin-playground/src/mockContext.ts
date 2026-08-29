import type { PluginContext } from "@linnote/plugin-sdk";

// A mocked PluginContext good enough to activate() a single plugin in
// isolation (Plugins §6) — logs to the console instead of touching a real
// registry, canvas, or persisted storage.
export function createMockContext(): PluginContext {
  const store = new Map<string, unknown>();
  return {
    commands: {
      register: (id, fn) => console.log("[playground] command registered:", id, fn),
      run: (id, ...args) => console.log("[playground] command run:", id, args),
    },
    menu: {
      addItem: (contribution) => console.log("[playground] menu item:", contribution),
    },
    canvas: {
      registerElementType: (contribution) =>
        console.log("[playground] canvas element type:", contribution),
    },
    storage: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      set: async <T>(key: string, value: T) => {
        store.set(key, value);
      },
    },
    events: {
      on: (event, handler) => console.log("[playground] listening:", event, handler),
      emit: (event, ...args) => console.log("[playground] emit:", event, args),
    },
  };
}
