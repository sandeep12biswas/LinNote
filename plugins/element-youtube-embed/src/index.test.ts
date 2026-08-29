import { describe, expect, it } from "vitest";
import { plugin } from "./index";

describe("core.element.youtube-embed", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.element.youtube-embed");
  });
});
