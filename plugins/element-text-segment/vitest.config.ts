import { defineConfig } from "vitest/config";

// SegmentLayer.test.tsx mounts real React/TipTap editors — jsdom provides
// the DOM those need, same reasoning as packages/rich-text-engine's own
// vitest.config.ts. Scoped to this package only.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
