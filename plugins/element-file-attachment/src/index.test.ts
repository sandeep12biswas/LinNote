import { describe, expect, it } from "vitest";
import { plugin } from "./index";

describe("core.element.file-attachment", () => {
  it("declares a manifest with the expected id", () => {
    expect(plugin.manifest.id).toBe("core.element.file-attachment");
  });
});
