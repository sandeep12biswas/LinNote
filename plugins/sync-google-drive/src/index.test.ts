import { describe, expect, it } from "vitest";
import { plugin } from "./index";

describe("core.sync.google-drive", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.sync.google-drive");
  });
});
