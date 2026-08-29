import { createRoot } from "react-dom/client";
import type { Plugin } from "@linnote/plugin-sdk";
import { createMockContext } from "./mockContext";

// Called from each plugins/<name>/playground.tsx entry point:
//
//   import { plugin } from "./src";
//   import { runPlugin } from "@linnote/plugin-playground/src/runPlugin";
//   runPlugin(plugin);
//
// TODO(phase-1): render the plugin's actual contributed UI (toolbar
// button, menu item, canvas element) once the registry's rendering
// contract exists, instead of just calling activate() and dumping the
// manifest.
export function runPlugin(plugin: Plugin): void {
  const container = document.getElementById("root");
  if (!container) throw new Error("plugin-playground: #root element not found");

  const ctx = createMockContext();
  void plugin.activate(ctx);

  createRoot(container).render(
    <pre style={{ fontFamily: "monospace", padding: "1rem" }}>
      {JSON.stringify(plugin.manifest, null, 2)}
    </pre>,
  );
}
