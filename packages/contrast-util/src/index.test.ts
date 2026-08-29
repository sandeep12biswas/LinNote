import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance, suggestTextColor } from "./index";

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("expands 3-digit hex the same as its 6-digit equivalent", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(relativeLuminance("#ffffff"), 10);
    expect(relativeLuminance("#000")).toBeCloseTo(relativeLuminance("#000000"), 10);
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black against white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("is 1:1 for a color against itself", () => {
    expect(contrastRatio("#3366cc", "#3366cc")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#123456", "#abcdef")).toBeCloseTo(
      contrastRatio("#abcdef", "#123456"),
      10,
    );
  });
});

describe("suggestTextColor", () => {
  it("suggests white text on a dark background", () => {
    expect(suggestTextColor("#111111")).toBe("#ffffff");
  });

  it("suggests black text on a light background", () => {
    expect(suggestTextColor("#f5f5f5")).toBe("#000000");
  });
});
