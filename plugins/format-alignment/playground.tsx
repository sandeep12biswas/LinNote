import { runPlugin } from "@linnote/plugin-playground";
import { plugin } from "./src/index";

// Boots this one plugin in isolation, no Tauri app, no other plugins
// (Plugins §6). Run: pnpm --filter @linnote/plugin-format-alignment dev
runPlugin(plugin);
