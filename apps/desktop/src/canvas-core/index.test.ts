import { suggestTextColor } from "@linnote/contrast-util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistenceProvider } from "../persistence";
import type { CanvasElement, NotePage, SegmentBlock } from "../types";
import {
  addElementToPage,
  createBlankNotePage,
  createNotePageAutosave,
  DEFAULT_VIEWPORT,
  getOrCreatePage,
  loadNotePage,
  MAX_SCALE,
  MIN_SCALE,
  panViewport,
  setBackgroundColorInPage,
  updateElementInPage,
  updateHeaderInPage,
  useNotePageStore,
  zoomViewport,
  type Viewport,
} from "./index";
import { createSeedNotePages, DEFAULT_BACKGROUND_COLOR } from "./mockData";

/** A fake `PersistenceProvider` — only the methods this file's own tests exercise are meaningfully implemented, the rest just satisfy the type. */
function makeFakePersistence(overrides: Partial<PersistenceProvider> = {}): PersistenceProvider {
  return {
    readTree: vi.fn(async () => []),
    writeTree: vi.fn(async () => {}),
    readPage: vi.fn(async () => {
      throw new Error("no persisted page");
    }),
    writePage: vi.fn(async () => {}),
    deletePage: vi.fn(async () => {}),
    readAsset: vi.fn(async () => new Blob()),
    writeAsset: vi.fn(async () => {}),
    readPluginSettings: vi.fn(async () => ({})),
    writePluginSettings: vi.fn(async () => {}),
    ...overrides,
  };
}

function makePage(overrides: Partial<NotePage> = {}): NotePage {
  return {
    id: "page-1",
    header: { title: "Untitled", align: "left" },
    background: { kind: "color", color: "#ffffff" },
    elements: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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
    expect(page.background.color).toBe(DEFAULT_BACKGROUND_COLOR);
    // Computed live via contrast-util, not a hand-picked constant (NTA-35).
    expect(page.background.suggestedTextColor).toBe(suggestTextColor(DEFAULT_BACKGROUND_COLOR));
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

describe("updateHeaderInPage", () => {
  it("replaces the header via updater and bumps updatedAt, without mutating the input page", () => {
    const page = createBlankNotePage("page-1");

    const result = updateHeaderInPage(page, (header) => ({ ...header, title: "New Title", align: "center" }));

    expect(result.header).toEqual({ title: "New Title", align: "center" });
    expect(page.header).toEqual({ title: "Untitled Page", align: "left" }); // input untouched
    expect(result.updatedAt >= page.updatedAt).toBe(true);
  });
});

describe("setBackgroundColorInPage", () => {
  it("sets the background color, recomputes suggestedTextColor via contrast-util, and bumps updatedAt, without mutating the input page", () => {
    const page = createBlankNotePage("page-1");

    const result = setBackgroundColorInPage(page, "#000000");

    expect(result.background.color).toBe("#000000");
    expect(result.background.suggestedTextColor).toBe(suggestTextColor("#000000"));
    expect(result.background.suggestedTextColor).toBe("#ffffff"); // sanity: white text on black
    expect(page.background.color).toBe(DEFAULT_BACKGROUND_COLOR); // input untouched
    expect(result.updatedAt >= page.updatedAt).toBe(true);
  });

  it("forces kind to \"color\" even if the page previously had a pattern background", () => {
    const patterned: ReturnType<typeof createBlankNotePage> = {
      ...createBlankNotePage("page-1"),
      background: { kind: "pattern", pattern: "ruled", color: "#f7f5ef" },
    };

    const result = setBackgroundColorInPage(patterned, "#123456");

    expect(result.background.kind).toBe("color");
    expect(result.background.color).toBe("#123456");
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

  it("updateHeader replaces the header on an already-open page", () => {
    useNotePageStore.getState().updateHeader("page-groceries", (header) => ({ ...header, title: "Shopping List" }));

    expect(useNotePageStore.getState().pages["page-groceries"].header.title).toBe("Shopping List");
  });

  it("updateHeader get-or-creates a page that hasn't been opened yet, rather than throwing", () => {
    useNotePageStore.getState().updateHeader("page-never-opened", (header) => ({ ...header, align: "right" }));

    expect(useNotePageStore.getState().pages["page-never-opened"].header.align).toBe("right");
  });

  it("setBackgroundColor sets the color and recomputed suggestion on an already-open page", () => {
    useNotePageStore.getState().setBackgroundColor("page-groceries", "#000000");

    const background = useNotePageStore.getState().pages["page-groceries"].background;
    expect(background.color).toBe("#000000");
    expect(background.suggestedTextColor).toBe(suggestTextColor("#000000"));
  });

  it("setBackgroundColor get-or-creates a page that hasn't been opened yet, rather than throwing", () => {
    useNotePageStore.getState().setBackgroundColor("page-never-opened", "#123456");

    expect(useNotePageStore.getState().pages["page-never-opened"].background.color).toBe("#123456");
  });
});

describe("loadNotePage (NTA-69)", () => {
  beforeEach(() => {
    useNotePageStore.setState({ pages: {} });
  });

  it("does nothing (no persistence call) when the page is already loaded this session", async () => {
    useNotePageStore.setState({ pages: { "page-1": makePage() } });
    const persistence = makeFakePersistence();

    await loadNotePage(persistence, "page-1");

    expect(persistence.readPage).not.toHaveBeenCalled();
  });

  it("loads a persisted page into the store when one exists on disk", async () => {
    const persisted = makePage({ id: "page-1", header: { title: "From disk", align: "left" } });
    const persistence = makeFakePersistence({ readPage: vi.fn(async () => persisted) });

    await loadNotePage(persistence, "page-1");

    expect(useNotePageStore.getState().pages["page-1"]).toEqual(persisted);
  });

  it("falls back to ensurePage's own synthesis and persists it when no file exists on disk", async () => {
    const persistence = makeFakePersistence(); // readPage rejects by default

    await loadNotePage(persistence, "page-never-before-opened");

    const synthesized = useNotePageStore.getState().pages["page-never-before-opened"];
    expect(synthesized).toBeDefined();
    expect(persistence.writePage).toHaveBeenCalledWith("page-never-before-opened", synthesized);
  });
});

describe("createNotePageAutosave (NTA-70)", () => {
  beforeEach(() => {
    useNotePageStore.setState({ pages: { "page-1": makePage({ id: "page-1" }) } });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces writePage — no write until 800ms of inactivity have passed", () => {
    const persistence = makeFakePersistence();
    const autosave = createNotePageAutosave(persistence);
    const unsubscribe = autosave.wire();
    try {
      useNotePageStore.getState().setBackgroundColor("page-1", "#000000");

      vi.advanceTimersByTime(500);
      expect(persistence.writePage).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);
      expect(persistence.writePage).toHaveBeenCalledTimes(1);
      expect(persistence.writePage).toHaveBeenCalledWith("page-1", useNotePageStore.getState().pages["page-1"]);
    } finally {
      unsubscribe();
    }
  });

  it("coalesces a burst of edits to the same page into one write", () => {
    const persistence = makeFakePersistence();
    const autosave = createNotePageAutosave(persistence);
    const unsubscribe = autosave.wire();
    try {
      useNotePageStore.getState().setBackgroundColor("page-1", "#111111");
      vi.advanceTimersByTime(400);
      useNotePageStore.getState().setBackgroundColor("page-1", "#222222");
      vi.advanceTimersByTime(800);

      expect(persistence.writePage).toHaveBeenCalledTimes(1);
      expect(persistence.writePage).toHaveBeenCalledWith(
        "page-1",
        expect.objectContaining({ background: expect.objectContaining({ color: "#222222" }) }),
      );
    } finally {
      unsubscribe();
    }
  });

  it("flush() writes every pending page immediately, skipping the debounce wait", async () => {
    const persistence = makeFakePersistence();
    const autosave = createNotePageAutosave(persistence);
    const unsubscribe = autosave.wire();
    try {
      useNotePageStore.getState().setBackgroundColor("page-1", "#333333");
      expect(persistence.writePage).not.toHaveBeenCalled();

      await autosave.flush();

      expect(persistence.writePage).toHaveBeenCalledTimes(1);

      // The debounce timer that would have fired later must be cancelled — no second write.
      vi.advanceTimersByTime(1000);
      expect(persistence.writePage).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it("stops scheduling writes after unsubscribing", () => {
    const persistence = makeFakePersistence();
    const autosave = createNotePageAutosave(persistence);
    const unsubscribe = autosave.wire();
    unsubscribe();

    useNotePageStore.getState().setBackgroundColor("page-1", "#444444");
    vi.advanceTimersByTime(1000);

    expect(persistence.writePage).not.toHaveBeenCalled();
  });
});
