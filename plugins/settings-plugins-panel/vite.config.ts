import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone dev server for this plugin's playground (Plugins §6) —
// never boots the full desktop app.
export default defineConfig({
  plugins: [react()],
});
