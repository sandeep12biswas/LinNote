import { beforeEach, describe, expect, it } from "vitest";
import type { CanvasElement, SegmentBlock } from "../types";
import {
  addElementToPage,
  createBlankNotePage,
  DEFAULT_VIEWPORT,
  getOrCreatePage,
  MAX_SCALE,
  MIN_SCALE,
  panViewport,
  updateElementInPage,
  useNotePageStore,
  zoomViewport,
  type Viewport,
} from "./index";
import { createSeedNotePages } from "./mockData";

function makeSegment(overrides: Partial<SegmentBlock> = {}): SegmentBlock {
  return {
    id: "segment-1",
    type: "segment",
    visibility: "invisible",
    x: 0,
    y: 0,
    width: 240,
    height: 32,
    content: undefined,
    zIndex: 0,
    ...overrides,
  };
}

describe("panViewport", () => {
  it("translates x/y by the drag delta, leaving scale untouched", () => {
    const viewport: Viewport = { x: 10, y: -5, scale: 2 };
    expect(panViewport(viewport, 3, 4)).toEqual({ x: 13, y: -1, scale: 2 });
  });

  it("accumulates over repeated pans, matching a drag made of many pointermove deltas", () => {
    let viewport = DEFAULT_VIEWPORT;
    viewport = panViewport(viewport, 5, 0);
    viewport = panViewport(viewport, 5, 0);
    viewport = panViewport(viewport, -2, 3);
    expect(viewport).toEqual({ x: 8, y: 3, scale: 1 });
  });
});

describe("zoomViewport", () => {
  it("keeps the canvas-space point under the pointer fixed on screen after zooming in", () => {
    const viewport: Viewport = { x: 0, y: 0, scale: 1 };
    const pointerX = 100;
    const pointerY = 50;
    const canvasPointBefore = {
      x: (pointerX - viewport.x) / viewport.scale,
      y: (pointerY - viewport.y) / viewport.scale,
    };

    const next = zoomViewport(viewport, pointerX, pointerY, 2);

    const canvasPointAfter = { x: (pointerX - next.x) / next.scale, y: (pointerY - next.y) / next.scale };
    expect(canvasPointAfter.x).toBeCloseTo(canvasPointBefore.x);
    expect(canvasPointAfter.y).toBeCloseTo(canvasPointBefore.y);
    expect(next.scale).toBe(2);
  });

  it("keeps the anchor fixed when zooming out too, and when the viewport is already panned", () => {
    const viewport: Viewport = { x: 40, y: -20, scale: 1.5 };
    const pointerX = 200;
    const pointerY = 120;
    const canvasPointBefore = {
      x: (pointerX - viewport.x) / viewport.scale,
      y: (pointerY - viewport.y) / viewport.scale,
    };

    const next = zoomViewport(viewport, pointerX, pointerY, 0.5);

    const canvasPointAfter = { x: (pointerX - next.x) / next.scale, y: (pointerY - next.y) / next.scale };
    expect(canvasPointAfter.x).toBeCloseTo(canvasPointBefore.x);
    expect(canvasPointAfter.y).toBeCloseTo(canvasPointBefore.y);
    expect(next.scale).toBeCloseTo(0.75);
  });

  it("clamps scale to MAX_SCALE and still keeps the anchor fixed using the applied (clamped) factor", () => {
    const viewport: Viewport = { x: 0, y: 0, scale: MAX_SCALE };
    const next = zoomViewport(viewport, 50, 50, 2); // requests doubling past the ceiling
    expect(next.scale).toBe(MAX_SCALE);
    // factor actually applied was 1 (already at the ceiling), so the
    // anchor point — and the whole viewport — shouldn't move at all.
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });

  it("clamps scale to MIN_SCALE", () => {
    const viewport: Viewport = { x: 0, y: 0, scale: MIN_SCALE };
    const next = zoomViewport(viewport, 50, 50, 0.1); // requests zooming out past the floor
    expect(next.scale).toBe(MIN_SCALE);
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });
});

describe("createBlankNotePage", () => {
  it("synthesizes an empty, untitled page with a default background for the given id", () => {
    const page = createBlankNotePage("page-new-123");
    expect(page.id).toBe("page-new-123");
    expect(page.header).toEqual({ title: "Untitled Page", align: "left" });
    expect(page.background.kind).toBe("color");
    expect(page.elements).toEqual([]);
    expect(page.createdAt).toBe(page.updatedAt);
  });
});

describe("getOrCreatePage", () => {
  it("returns an existing page unchanged, without touching the pages map", () => {
    const pages = createSeedNotePages();
    const existing = pages["page-roadmap"];

    const result = getOrCreatePage(pages, "page-roadmap");

    expect(result.page).toBe(existing);
    expect(result.pages).toBe(pages);
  });

  it("synthesizes and caches a blank page for an unknown id, without mutating the input map", () => {
    const pages = createSeedNotePages();

    const result = getOrCreatePage(pages, "page-brand-new");

    expect(result.page.id).toBe("page-brand-new");
    expect(result.pages["page-brand-new"]).toBe(result.page);
    expect(pages["page-brand-new"]).toBeUndefined(); // original map untouched
  });
});

describe("addElementToPage", () => {
  it("appends the element and bumps updatedAt, without mutating the input page", () => {
    const page = createBlankNotePage("page-1");
    const segment = makeSegment();

    const result = addElementToPage(page, segment);

    expect(result.elements).toEqual([segment]);
    expect(page.elements).toEqual([]); // input untouched
    expect(result.updatedAt >= page.updatedAt).toBe(true);
  });
});

describe("updateElementInPage", () => {
  it("replaces the matching element via updater, without mutating the input page", () => {
    const segment = makeSegment();
    const page = addElementToPage(createBlankNotePage("page-1"), segment);
    const newContent = { type: "doc", content: [] };

    const result = updateElementInPage(page, segment.id, (element) => ({ ...element, content: newContent }));

    expect((result.elements[0] as SegmentBlock).content).toEqual(newContent);
    expect((page.elements[0] as SegmentBlock).content).toBeUndefined(); // input untouched
  });

  it("is a no-op (same page reference) when no element matches the id", () => {
    const page = addElementToPage(createBlankNotePage("page-1"), makeSegment());

    const result = updateElementInPage(page, "no-such-id", (element) => element);

    expect(result).toBe(page);
  });
});

describe("useNotePageStore", () => {
  beforeEach(() => {
    useNotePageStore.setState({ pages: createSeedNotePages() });
  });

  it("seeds a NotePage for each mock page-type WorkspaceNode from ../workspace/mockData.ts", () => {
    for (const id of ["page-meeting-notes", "page-roadmap", "page-roadmap-q1", "page-groceries"]) {
      const page = useNotePageStore.getState().pages[id];
      expect(page).toBeDefined();
      expect(page.id).toBe(id);
      expect(page.elements).toEqual([]);
    }
  });

  it("ensurePage returns the same cached object on repeated calls for a new page id", () => {
    const { ensurePage } = useNotePageStore.getState();

    const first = ensurePage("page-never-seen-before");
    const second = ensurePage("page-never-seen-before");

    expect(second).toBe(first);
    expect(useNotePageStore.getState().pages["page-never-seen-before"]).toBe(first);
  });

  it("ensurePage returns the existing seeded page as-is, without replacing it", () => {
    const before = useNotePageStore.getState().pages["page-groceries"];
    const { ensurePage } = useNotePageStore.getState();

    const returned = ensurePage("page-groceries");

    expect(returned).toBe(before);
  });

  it("addElement appends onto an already-open page", () => {
    const segment = makeSegment();

    useNotePageStore.getState().addElement("page-groceries", segment);

    expect(useNotePageStore.getState().pages["page-groceries"].elements).toEqual([segment]);
  });

  it("addElement get-or-creates a page that hasn't been opened yet, rather than throwing", () => {
    const segment = makeSegment();

    useNotePageStore.getState().addElement("page-never-opened", segment);

    expect(useNotePageStore.getState().pages["page-never-opened"].elements).toEqual([segment]);
  });

  it("updateElement replaces a matching element on an open page", () => {
    const segment = makeSegment();
    useNotePageStore.getState().addElement("page-groceries", segment);

    useNotePageStore
      .getState()
      .updateElement("page-groceries", segment.id, (element) => ({ ...element, x: 42 } as CanvasElement));

    expect((useNotePageStore.getState().pages["page-groceries"].elements[0] as SegmentBlock).x).toBe(42);
  });

  it("updateElement no-ops for a page id that doesn't exist yet", () => {
    const before = useNotePageStore.getState().pages;

    useNotePageStore.getState().updateElement("page-never-opened", "some-id", (element) => element);

    expect(useNotePageStore.getState().pages).toBe(before);
  });
});
