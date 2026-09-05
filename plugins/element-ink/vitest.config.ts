import { defineConfig } from "vitest/config";

// InkLayer.test.tsx mounts a real React component (pointer capture, tool
// panel via createPortal) — jsdom provides the DOM that needs, same
// reasoning as plugins/element-text-segment's own vitest.config.ts.
// Scoped to this package only.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
