import { describe, expect, it } from "vitest";
import { plugin } from "./index";

describe("core.format.checkbox-list", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.format.checkbox-list");
  });
});
