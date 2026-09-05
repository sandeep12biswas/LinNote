import { defineConfig } from "vitest/config";

// index.test.ts exercises `openFontColorPicker`'s real DOM manipulation
// (creating/clicking/removing a hidden <input type="color">) — jsdom
// provides the `document` that needs, same reasoning as several other
// packages' own vitest.config.ts. Scoped to this package only.
export default defineConfig({
  test: {
    environment: "jsdom",
  },
});
