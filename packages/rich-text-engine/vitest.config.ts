import { defineConfig } from "vitest/config";

// TipTap/ProseMirror needs a real DOM (document/window) to construct an
// Editor, even headless (no `element` mounted) — jsdom provides that for
// this package's tests. Scoped to this package only.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
