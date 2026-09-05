import { defineConfig } from "vitest/config";

// NTA-34's PageHeader.test.tsx mounts real React components — jsdom
// provides the DOM that needs, same reasoning as
// packages/rich-text-engine's and plugins/element-text-segment's own
// vitest.config.ts. Every other existing test here is a pure-function/
// store test with no DOM dependency, so this is a safe workspace-wide
// default for this package rather than something scoped narrower.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
