import { describe, expect, it } from "vitest";
import { isRectVisible, VIEWPORT_CULL_MARGIN, type Rect } from "./viewportCulling";

const visibleRect: Rect = { x: 0, y: 0, width: 800, height: 600 };

describe("isRectVisible", () => {
  it("is true for a segment fully inside the visible rect", () => {
    expect(isRectVisible({ x: 100, y: 100, width: 200, height: 50 }, visibleRect, 0)).toBe(true);
  });

  it("is true for a segment that only partially overlaps the visible rect", () => {
    expect(isRectVisible({ x: -50, y: -50, width: 100, height: 100 }, visibleRect, 0)).toBe(true);
  });

  it("is false for a segment entirely past the right edge, beyond the margin", () => {
    const rect: Rect = { x: 800 + VIEWPORT_CULL_MARGIN + 10, y: 0, width: 100, height: 50 };
    expect(isRectVisible(rect, visibleRect, VIEWPORT_CULL_MARGIN)).toBe(false);
  });

  it("is true for a segment just past the strict edge but still within the margin", () => {
    const rect: Rect = { x: 800 + 50, y: 0, width: 100, height: 50 }; // 50px past the edge, well under the default 400px margin
    expect(isRectVisible(rect, visibleRect, VIEWPORT_CULL_MARGIN)).toBe(true);
  });

  it("is false for a segment entirely above the top edge, beyond the margin", () => {
    const rect: Rect = { x: 0, y: -(VIEWPORT_CULL_MARGIN + 100), width: 100, height: 50 };
    expect(isRectVisible(rect, visibleRect, VIEWPORT_CULL_MARGIN)).toBe(false);
  });

  it("is false for a segment entirely below the bottom edge, beyond the margin", () => {
    const rect: Rect = { x: 0, y: 600 + VIEWPORT_CULL_MARGIN + 100, width: 100, height: 50 };
    expect(isRectVisible(rect, visibleRect, VIEWPORT_CULL_MARGIN)).toBe(false);
  });

  it("is false for a segment entirely left of the left edge, beyond the margin", () => {
    const rect: Rect = { x: -(VIEWPORT_CULL_MARGIN + 200), y: 0, width: 100, height: 50 };
    expect(isRectVisible(rect, visibleRect, VIEWPORT_CULL_MARGIN)).toBe(false);
  });

  it("treats margin 0 as an exact intersection test", () => {
    // Touching but not overlapping (rect starts exactly at the visible rect's right edge) — no overlap.
    expect(isRectVisible({ x: 800, y: 0, width: 100, height: 50 }, visibleRect, 0)).toBe(false);
  });
});
