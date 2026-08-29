import { describe, expect, it } from "vitest";
import { plugin } from "./index";

describe("core.format.bold", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.format.bold");
  });
});
