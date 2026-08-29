import { describe, expect, it } from "vitest";
import { plugin } from "./index";

describe("core.settings.plugins", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.settings.plugins");
  });

  it("declares a settingsPanels contribution for the Plugins panel", () => {
    expect(plugin.manifest.contributes.settingsPanels).toEqual([{ id: "plugins", label: "Plugins" }]);
  });

  it("activate() does not throw with no meaningful ctx wired up yet", () => {
    expect(() => plugin.activate({} as never)).not.toThrow();
  });
});
