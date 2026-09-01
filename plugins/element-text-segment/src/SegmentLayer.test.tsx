import { act, useCallback, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { simulateResize } from "../vitest.setup";
import {
  isPointInsideSegment,
  maxWidthBeforeCollision,
  MIN_SEGMENT_WIDTH,
  nextZIndex,
  resolveNonOverlap,
  SEGMENT_GAP,
  SegmentLayer,
  type CanvasPoint,
  type SegmentBlockData,
  type SegmentRect,
} from "./SegmentLayer";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

function mount(children: ReactNode): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(children));
}

function dispatchKeyDown(key: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

/** Fake `screenToCanvas` for tests — canvas-core's real one undoes pan/zoom; tests just need clientX/clientY to pass through unchanged (1:1 scale, no pan), consistent with how these tests treat "screen" and "canvas" space as the same numbers throughout. */
function identityScreenToCanvas(clientX: number, clientY: number): CanvasPoint {
  return { x: clientX, y: clientY };
}

function makeSegment(overrides: Partial<SegmentBlockData> = {}): SegmentBlockData {
  return {
    id: "segment-1",
    type: "segment",
    visibility: "invisible",
    x: 10,
    y: 10,
    width: 100,
    height: 20,
    content: undefined,
    zIndex: 0,
    ...overrides,
  };
}

/** A minimal controlled host, standing in for ../../apps/desktop/src/canvas-core/SegmentLayerHost.tsx: owns `segments` state and feeds SegmentLayer's callbacks back into it, the same way the real app does. */
function Harness({ pointerPosition }: { pointerPosition: { x: number; y: number } | null }) {
  const [segments, setSegments] = useState<SegmentBlockData[]>([]);

  const handleCreate = useCallback((segment: SegmentBlockData) => {
    setSegments((current) => [...current, segment]);
  }, []);

  const handleContentChange = useCallback((id: string, content: SegmentBlockData["content"]) => {
    setSegments((current) => current.map((segment) => (segment.id === id ? { ...segment, content } : segment)));
  }, []);

  const handleMove = useCallback((id: string, x: number, y: number) => {
    setSegments((current) => current.map((segment) => (segment.id === id ? { ...segment, x, y } : segment)));
  }, []);

  const handleHeightChange = useCallback((id: string, height: number) => {
    setSegments((current) => current.map((segment) => (segment.id === id ? { ...segment, height } : segment)));
  }, []);

  const handleResize = useCallback((id: string, x: number, width: number) => {
    setSegments((current) => current.map((segment) => (segment.id === id ? { ...segment, x, width } : segment)));
  }, []);

  return (
    <SegmentLayer
      segments={segments}
      pointerPosition={pointerPosition}
      onCreateSegment={handleCreate}
      onSegmentContentChange={handleContentChange}
      onMoveSegment={handleMove}
      onHeightChange={handleHeightChange}
      onResizeSegment={handleResize}
      screenToCanvas={identityScreenToCanvas}
    />
  );
}

/**
 * Imperative handle for the "advanced" harness below (NTA-38 tests) —
 * lets a test drive `pointerPosition` over time (a drag has a start and
 * an end) and call the "arm" trigger `SegmentLayer` hands its host via
 * `onCreateVisibleSegmentReady`, standing in for a real toolbar/menu
 * command dispatch.
 */
interface Controller {
  setPointerPosition: (point: CanvasPoint | null) => void;
  armCreateVisible: () => void;
  panSuppressedCalls: boolean[];
}

function makeController(): Controller {
  return {
    setPointerPosition: () => {},
    armCreateVisible: () => {},
    panSuppressedCalls: [],
  };
}

function DrawHarness({
  controller,
  initialPointerPosition = null,
  initialSegments = [],
}: {
  controller: Controller;
  initialPointerPosition?: CanvasPoint | null;
  initialSegments?: SegmentBlockData[];
}) {
  const [segments, setSegments] = useState<SegmentBlockData[]>(initialSegments);
  const [pointerPosition, setPointerPosition] = useState<CanvasPoint | null>(initialPointerPosition);
  controller.setPointerPosition = setPointerPosition;

  const handleCreate = useCallback((segment: SegmentBlockData) => {
    setSegments((current) => [...current, segment]);
  }, []);
  const handleContentChange = useCallback((id: string, content: SegmentBlockData["content"]) => {
    setSegments((current) => current.map((segment) => (segment.id === id ? { ...segment, content } : segment)));
  }, []);
  const handleMove = useCallback((id: string, x: number, y: number) => {
    setSegments((current) => current.map((segment) => (segment.id === id ? { ...segment, x, y } : segment)));
  }, []);
  const handleHeightChange = useCallback((id: string, height: number) => {
    setSegments((current) => current.map((segment) => (segment.id === id ? { ...segment, height } : segment)));
  }, []);
  const handleResize = useCallback((id: string, x: number, width: number) => {
    setSegments((current) => current.map((segment) => (segment.id === id ? { ...segment, x, width } : segment)));
  }, []);
  const handleReady = useCallback(
    (arm: () => void) => {
      controller.armCreateVisible = arm;
    },
    [controller],
  );
  const setPanSuppressed = useCallback(
    (suppressed: boolean) => {
      controller.panSuppressedCalls.push(suppressed);
    },
    [controller],
  );

  return (
    <SegmentLayer
      segments={segments}
      pointerPosition={pointerPosition}
      onCreateSegment={handleCreate}
      onSegmentContentChange={handleContentChange}
      onMoveSegment={handleMove}
      onHeightChange={handleHeightChange}
      onResizeSegment={handleResize}
      screenToCanvas={identityScreenToCanvas}
      onCreateVisibleSegmentReady={handleReady}
      setPanSuppressed={setPanSuppressed}
    />
  );
}

function dispatchPointer(type: "pointerdown" | "pointerup", button = 0): void {
  act(() => {
    window.dispatchEvent(new PointerEvent(type, { button, bubbles: true }));
  });
}

/** Like `dispatchPointer`, but on an arbitrary target with real coordinates — NTA-39's drag gesture needs `clientX`/`clientY` (fed through `identityScreenToCanvas` above) and, for a border-vs-content pointerdown, a specific `target` (not always `window`). */
function dispatchPointerEvent(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX = 0,
  clientY = 0,
  button = 0,
): void {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { button, clientX, clientY, bubbles: true }));
  });
}

describe("isPointInsideSegment", () => {
  const segment = makeSegment({ x: 10, y: 10, width: 100, height: 20 });

  it("is true for a point within the bounding box, inclusive of its edges", () => {
    expect(isPointInsideSegment({ x: 10, y: 10 }, segment)).toBe(true);
    expect(isPointInsideSegment({ x: 110, y: 30 }, segment)).toBe(true);
    expect(isPointInsideSegment({ x: 60, y: 20 }, segment)).toBe(true);
  });

  it("is false for a point outside the bounding box", () => {
    expect(isPointInsideSegment({ x: 9, y: 10 }, segment)).toBe(false);
    expect(isPointInsideSegment({ x: 60, y: 31 }, segment)).toBe(false);
  });
});

describe("nextZIndex", () => {
  it("is 0 for an empty list", () => {
    expect(nextZIndex([])).toBe(0);
  });

  it("is one more than the highest existing zIndex", () => {
    const segments = [makeSegment({ zIndex: 2 }), makeSegment({ zIndex: 5 }), makeSegment({ zIndex: 1 })];
    expect(nextZIndex(segments)).toBe(6);
  });
});

describe("resolveNonOverlap (NTA-41)", () => {
  it("returns the candidate unchanged when it doesn't overlap anything, even within the gap", () => {
    const neighbor: SegmentRect = { x: 100, y: 0, width: 50, height: 50 };
    const candidate: SegmentRect = { x: 0, y: 0, width: 50, height: 50 }; // right edge at 50, gap to neighbor's left edge (100) is 50 > SEGMENT_GAP
    expect(resolveNonOverlap(candidate, [neighbor])).toEqual(candidate);
  });

  it("pushes out horizontally when the horizontal correction is smaller than the vertical one", () => {
    // Candidate and neighbor fully overlap vertically (same y/height), and the horizontal
    // overlap is shallow — the minimal correction is clearly horizontal.
    const neighbor: SegmentRect = { x: 40, y: 0, width: 50, height: 50 };
    const candidate: SegmentRect = { x: 0, y: 0, width: 50, height: 50 }; // right edge at 50, 10px into neighbor's left edge
    const resolved = resolveNonOverlap(candidate, [neighbor]);
    expect(resolved.y).toBe(0); // untouched
    expect(resolved.x + resolved.width).toBeLessThanOrEqual(neighbor.x - SEGMENT_GAP + 0.001);
    expect(resolved.width).toBe(50); // width/height are never changed by this function
    expect(resolved.height).toBe(50);
  });

  it("pushes out vertically when the vertical correction is smaller than the horizontal one", () => {
    const neighbor: SegmentRect = { x: 0, y: 40, width: 50, height: 50 };
    const candidate: SegmentRect = { x: 0, y: 0, width: 50, height: 50 }; // bottom edge at 50, 10px into neighbor's top edge
    const resolved = resolveNonOverlap(candidate, [neighbor]);
    expect(resolved.x).toBe(0); // untouched
    expect(resolved.y + resolved.height).toBeLessThanOrEqual(neighbor.y - SEGMENT_GAP + 0.001);
  });

  it("leaves at least SEGMENT_GAP between the resolved rect and the neighbor's border", () => {
    const neighbor: SegmentRect = { x: 45, y: 0, width: 50, height: 50 };
    const candidate: SegmentRect = { x: 0, y: 0, width: 50, height: 50 };
    const resolved = resolveNonOverlap(candidate, [neighbor]);
    expect(neighbor.x - (resolved.x + resolved.width)).toBeCloseTo(SEGMENT_GAP);
  });

  it("resolves against multiple neighbors, fitting into a gap exactly wide enough", () => {
    // Left ends at x=0, right starts at x=32 — a 32px physical gap. A
    // 20-wide candidate needs 20 + 2*SEGMENT_GAP(6) = 32 to fit
    // cleanly, so there's exactly one legal position: x=6..26.
    const left: SegmentRect = { x: -50, y: 0, width: 50, height: 50 };
    const right: SegmentRect = { x: 32, y: 0, width: 50, height: 50 };
    const candidate: SegmentRect = { x: 0, y: 0, width: 20, height: 50 }; // overlaps left's gap zone only, initially
    const resolved = resolveNonOverlap(candidate, [left, right]);
    expect(resolved.x).toBe(6);
    expect(resolved.x + resolved.width).toBe(26);
  });
});

describe("maxWidthBeforeCollision (NTA-41)", () => {
  it("is Infinity-clamped-to-MIN when nothing blocks growth in that direction", () => {
    expect(maxWidthBeforeCollision(0, "right", 0, 30, [])).toBe(Infinity);
  });

  it("clamps growth to the right at a neighbor's gap-expanded left edge", () => {
    const neighbor: SegmentRect = { x: 100, y: 0, width: 50, height: 30 };
    // Growing right from a fixed left edge at 0: can reach at most neighbor.x - SEGMENT_GAP.
    expect(maxWidthBeforeCollision(0, "right", 0, 30, [neighbor])).toBe(100 - SEGMENT_GAP);
  });

  it("clamps growth to the left at a neighbor's gap-expanded right edge", () => {
    const neighbor: SegmentRect = { x: 0, y: 0, width: 50, height: 30 };
    // Growing left from a fixed right edge at 150: the moving (left) edge can reach at
    // most neighbor's right edge + gap, i.e. width caps at fixedEdge - (that boundary).
    expect(maxWidthBeforeCollision(150, "left", 0, 30, [neighbor])).toBe(150 - (50 + SEGMENT_GAP));
  });

  it("ignores a neighbor with no vertical overlap, even if it's otherwise in the way horizontally", () => {
    const neighborBelow: SegmentRect = { x: 100, y: 200, width: 50, height: 30 };
    expect(maxWidthBeforeCollision(0, "right", 0, 30, [neighborBelow])).toBe(Infinity);
  });

  it("never returns less than MIN_SEGMENT_WIDTH even if a neighbor is very close", () => {
    const neighbor: SegmentRect = { x: 5, y: 0, width: 50, height: 30 };
    expect(maxWidthBeforeCollision(0, "right", 0, 30, [neighbor])).toBe(MIN_SEGMENT_WIDTH);
  });
});

describe("SegmentLayer: rendering existing segments", () => {
  it("renders each segment positioned by x/y/width, classed by its visibility", () => {
    function Wrapper() {
      const segments: SegmentBlockData[] = [makeSegment({ id: "s1", visibility: "visible", x: 1, y: 2, width: 50 })];
      return (
        <SegmentLayer
          segments={segments}
          pointerPosition={null}
          onCreateSegment={() => {}}
          onSegmentContentChange={() => {}}
          onMoveSegment={() => {}}
          onHeightChange={() => {}}
          onResizeSegment={() => {}}
          screenToCanvas={identityScreenToCanvas}
        />
      );
    }
    mount(<Wrapper />);

    const block = container!.querySelector(".segment-block") as HTMLElement;
    expect(block).not.toBeNull();
    expect(block.className).toContain("segment-block--visible");
    expect(block.style.left).toBe("1px");
    expect(block.style.top).toBe("2px");
    expect(block.style.width).toBe("50px");
  });
});

describe("SegmentLayer: invisible create-on-type (NTA-37)", () => {
  it("creates a new invisible segment at the pointer's canvas position on the first printable keystroke", () => {
    mount(<Harness pointerPosition={{ x: 50, y: 80 }} />);

    dispatchKeyDown("H");

    const block = container!.querySelector(".segment-block") as HTMLElement;
    expect(block).not.toBeNull();
    expect(block.className).toContain("segment-block--invisible");
    expect(block.style.left).toBe("50px");
    expect(block.style.top).toBe("80px");
  });

  it("feeds the triggering keystroke into the new segment's editor as its first character", () => {
    mount(<Harness pointerPosition={{ x: 0, y: 0 }} />);

    dispatchKeyDown("H");

    expect(container!.querySelector(".ProseMirror")?.textContent).toBe("H");
  });

  it("does nothing when the pointer isn't over the canvas", () => {
    mount(<Harness pointerPosition={null} />);

    dispatchKeyDown("H");

    expect(container!.querySelector(".segment-block")).toBeNull();
  });

  it("does nothing when the pointer is over an already-existing segment", () => {
    mount(<Harness pointerPosition={{ x: 5, y: 5 }} />);
    dispatchKeyDown("H"); // creates one segment anchored at (5, 5)

    dispatchKeyDown("i"); // pointer is still inside that segment's bounds

    expect(container!.querySelectorAll(".segment-block")).toHaveLength(1);
  });

  it("does nothing when something other than the canvas already has focus", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    mount(<Harness pointerPosition={{ x: 0, y: 0 }} />);
    dispatchKeyDown("H");

    expect(container!.querySelector(".segment-block")).toBeNull();
    input.remove();
  });

  it("ignores modified keystrokes (e.g. Ctrl+something)", () => {
    mount(<Harness pointerPosition={{ x: 0, y: 0 }} />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }));
    });

    expect(container!.querySelector(".segment-block")).toBeNull();
  });
});

describe("SegmentLayer: deliberate visible creation (NTA-38)", () => {
  it("does nothing until armed — pointer activity alone never creates a visible segment", () => {
    const controller = makeController();
    mount(<DrawHarness controller={controller} initialPointerPosition={{ x: 20, y: 20 }} />);

    dispatchPointer("pointerdown");
    dispatchPointer("pointerup");

    expect(container!.querySelector(".segment-block")).toBeNull();
  });

  it("a plain click after arming creates a default-sized visible segment at the click point, suppressing then releasing pan", () => {
    const controller = makeController();
    mount(<DrawHarness controller={controller} initialPointerPosition={{ x: 20, y: 20 }} />);

    act(() => controller.armCreateVisible());
    dispatchPointer("pointerdown"); // no movement between down and up -> "plain click"
    dispatchPointer("pointerup");

    const block = container!.querySelector(".segment-block") as HTMLElement;
    expect(block).not.toBeNull();
    expect(block.className).toContain("segment-block--visible");
    expect(block.style.left).toBe("20px");
    expect(block.style.top).toBe("20px");
    expect(controller.panSuppressedCalls).toEqual([true, false]);
  });

  it("a drag past the threshold after arming creates a visible segment sized and positioned to the dragged rectangle", () => {
    const controller = makeController();
    mount(<DrawHarness controller={controller} initialPointerPosition={{ x: 100, y: 80 }} />);

    act(() => controller.armCreateVisible());
    dispatchPointer("pointerdown"); // drag start at (100, 80)
    act(() => controller.setPointerPosition({ x: 40, y: 30 })); // dragged up-left to (40, 30)
    dispatchPointer("pointerup");

    const block = container!.querySelector(".segment-block") as HTMLElement;
    expect(block).not.toBeNull();
    // top-left of the normalized rectangle, not the drag's start point
    expect(block.style.left).toBe("40px");
    expect(block.style.top).toBe("30px");
    expect(block.style.width).toBe("60px"); // |100 - 40|
  });

  it("disarms and creates nothing when the first pointerdown after arming lands off-canvas (pointer position null), releasing the pan suppression arming set", () => {
    const controller = makeController();
    mount(<DrawHarness controller={controller} initialPointerPosition={null} />);

    act(() => controller.armCreateVisible());
    dispatchPointer("pointerdown");
    dispatchPointer("pointerup");

    expect(container!.querySelector(".segment-block")).toBeNull();
    expect(controller.panSuppressedCalls).toEqual([true, false]);
  });

  it("Escape cancels an armed-but-not-yet-dragging gesture", () => {
    const controller = makeController();
    mount(<DrawHarness controller={controller} initialPointerPosition={{ x: 20, y: 20 }} />);

    act(() => controller.armCreateVisible());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    dispatchPointer("pointerdown");
    dispatchPointer("pointerup");

    expect(container!.querySelector(".segment-block")).toBeNull();
  });

  it("ignores other keystrokes while armed, rather than falling through to invisible create-on-type", () => {
    const controller = makeController();
    mount(<DrawHarness controller={controller} initialPointerPosition={{ x: 20, y: 20 }} />);

    act(() => controller.armCreateVisible());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "H", bubbles: true, cancelable: true }));
    });

    expect(container!.querySelector(".segment-block")).toBeNull();

    // still armed afterwards — a click now still completes the visible-creation gesture
    dispatchPointer("pointerdown");
    dispatchPointer("pointerup");
    expect(container!.querySelector(".segment-block")?.className).toContain("segment-block--visible");
  });
});

describe("SegmentLayer: drag/reposition an existing segment (NTA-39)", () => {
  it("grabbing the border and dragging updates the segment's position, suppressing then releasing pan", () => {
    const controller = makeController();
    const segment = makeSegment({ id: "seg-1", visibility: "visible", x: 50, y: 50, width: 100, height: 30 });
    mount(<DrawHarness controller={controller} initialSegments={[segment]} />);
    const block = container!.querySelector(".segment-block") as HTMLElement;

    dispatchPointerEvent(block, "pointerdown", 60, 60); // grabs the border/padding — target === currentTarget
    dispatchPointerEvent(window, "pointermove", 90, 80); // +30, +20
    dispatchPointerEvent(window, "pointerup", 90, 80);

    expect(block.style.left).toBe("80px");
    expect(block.style.top).toBe("70px");
    expect(controller.panSuppressedCalls).toEqual([true, false]);
  });

  it("updates position live on every pointermove during the drag, not only once on release", () => {
    const controller = makeController();
    const segment = makeSegment({ id: "seg-1", visibility: "visible", x: 0, y: 0, width: 100, height: 30 });
    mount(<DrawHarness controller={controller} initialSegments={[segment]} />);
    const block = container!.querySelector(".segment-block") as HTMLElement;

    dispatchPointerEvent(block, "pointerdown", 0, 0);
    dispatchPointerEvent(window, "pointermove", 10, 5);
    expect(block.style.left).toBe("10px");
    expect(block.style.top).toBe("5px");

    dispatchPointerEvent(window, "pointermove", 25, 15);
    expect(block.style.left).toBe("25px");
    expect(block.style.top).toBe("15px");

    dispatchPointerEvent(window, "pointerup", 25, 15);
  });

  it("grabbing the text content, not the border, does not start a drag — normal caret placement is left alone", () => {
    const controller = makeController();
    const segment = makeSegment({ id: "seg-1", visibility: "visible", x: 50, y: 50, width: 100, height: 30 });
    mount(<DrawHarness controller={controller} initialSegments={[segment]} />);
    const prose = container!.querySelector(".ProseMirror")!;

    dispatchPointerEvent(prose, "pointerdown", 60, 60); // target is the ProseMirror content, not the wrapper
    dispatchPointerEvent(window, "pointermove", 200, 200);
    dispatchPointerEvent(window, "pointerup", 200, 200);

    const block = container!.querySelector(".segment-block") as HTMLElement;
    expect(block.style.left).toBe("50px");
    expect(block.style.top).toBe("50px");
    expect(controller.panSuppressedCalls).toEqual([]); // never started dragging, so pan suppression was never touched
  });

  it("ignores a non-primary-button press on the border", () => {
    const controller = makeController();
    const segment = makeSegment({ id: "seg-1", visibility: "visible", x: 5, y: 5, width: 100, height: 30 });
    mount(<DrawHarness controller={controller} initialSegments={[segment]} />);
    const block = container!.querySelector(".segment-block") as HTMLElement;

    dispatchPointerEvent(block, "pointerdown", 10, 10, 2); // right-click
    dispatchPointerEvent(window, "pointermove", 100, 100);
    dispatchPointerEvent(window, "pointerup", 100, 100);

    expect(block.style.left).toBe("5px");
    expect(block.style.top).toBe("5px");
  });

  it("a pointermove with no drag in progress does nothing", () => {
    const controller = makeController();
    const segment = makeSegment({ id: "seg-1", visibility: "visible", x: 5, y: 5, width: 100, height: 30 });
    mount(<DrawHarness controller={controller} initialSegments={[segment]} />);

    dispatchPointerEvent(window, "pointermove", 500, 500);

    const block = container!.querySelector(".segment-block") as HTMLElement;
    expect(block.style.left).toBe("5px");
    expect(block.style.top).toBe("5px");
  });

  it("preserves the editor's DOM node identity (no remount/flicker) and its content across a drag", () => {
    const controller = makeController();
    const segment = makeSegment({
      id: "seg-1",
      visibility: "visible",
      x: 50,
      y: 50,
      width: 100,
      height: 30,
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] },
    });
    mount(<DrawHarness controller={controller} initialSegments={[segment]} />);
    const block = container!.querySelector(".segment-block") as HTMLElement;
    const proseBefore = container!.querySelector(".ProseMirror");
    expect(proseBefore?.textContent).toBe("Hello");

    dispatchPointerEvent(block, "pointerdown", 60, 60);
    dispatchPointerEvent(window, "pointermove", 160, 160);
    dispatchPointerEvent(window, "pointerup", 160, 160);

    const proseAfter = container!.querySelector(".ProseMirror");
    expect(proseAfter).toBe(proseBefore); // same DOM node reference -> the editor was never torn down and remounted
    expect(proseAfter?.textContent).toBe("Hello"); // content byte-identical
    expect(block.style.left).toBe("150px"); // 50 + (160 - 60)
    expect(block.style.top).toBe("150px");
  });
});

describe("SegmentLayer: manual-resize width with reflow (NTA-40)", () => {
  it("dragging the right resize handle changes only the width, suppressing then releasing pan", () => {
    const controller = makeController();
    const segment = makeSegment({ id: "seg-1", visibility: "visible", x: 50, y: 50, width: 100, height: 30 });
    mount(<DrawHarness controller={controller} initialSegments={[segment]} />);
    const handle = container!.querySelector(".segment-block__resize-handle--right")!;

    dispatchPointerEvent(handle, "pointerdown", 150, 50); // right edge, at x = 50 + 100
    dispatchPointerEvent(window, "pointermove", 180, 50); // +30
    dispatchPointerEvent(window, "pointerup", 180, 50);

    const block = container!.querySelector(".segment-block") as HTMLElement;
    expect(block.style.width).toBe("130px");
    expect(block.style.left).toBe("50px"); // unchanged
    expect(block.style.top).toBe("50px"); // unchanged — a resize never repositions vertically
    expect(controller.panSuppressedCalls).toEqual([true, false]);
  });

  it("dragging the left resize handle changes width and x together, keeping the right edge fixed", () => {
    const controller = makeController();
    const segment = makeSegment({ id: "seg-1", visibility: "visible", x: 50, y: 50, width: 100, height: 30 });
    mount(<DrawHarness controller={controller} initialSegments={[segment]} />);
    const handle = container!.querySelector(".segment-block__resize-handle--left")!;

    dispatchPointerEvent(handle, "pointerdown", 50, 50);
    dispatchPointerEvent(window, "pointermove", 70, 50); // left edge moves right by 20 -> width shrinks by 20
    dispatchPointerEvent(window, "pointerup", 70, 50);

    const block = container!.querySelector(".segment-block") as HTMLElement;
    expect(block.style.width).toBe("80px"); // 100 - 20
    expect(block.style.left).toBe("70px"); // 50 + 20
    // right edge (x + width) unchanged: 70 + 80 === 50 + 100 === 150
  });

  it("clamps width to MIN_SEGMENT_WIDTH, keeping the right edge fixed even once clamped from the left handle", () => {
    const controller = makeController();
    const segment = makeSegment({ id: "seg-1", visibility: "visible", x: 50, y: 50, width: 100, height: 30 });
    mount(<DrawHarness controller={controller} initialSegments={[segment]} />);
    const handle = container!.querySelector(".segment-block__resize-handle--left")!;

    dispatchPointerEvent(handle, "pointerdown", 50, 50);
    dispatchPointerEvent(window, "pointermove", 500, 50); // dragged the left edge way past the right edge
    dispatchPointerEvent(window, "pointerup", 500, 50);

    const block = container!.querySelector(".segment-block") as HTMLElement;
    expect(block.style.width).toBe(`${MIN_SEGMENT_WIDTH}px`);
    expect(block.style.left).toBe(`${50 + 100 - MIN_SEGMENT_WIDTH}px`); // right edge still at 150
  });

  it("grabbing a resize handle does not also start a reposition drag on the wrapper", () => {
    const controller = makeController();
    const segment = makeSegment({ id: "seg-1", visibility: "visible", x: 50, y: 50, width: 100, height: 30 });
    mount(<DrawHarness controller={controller} initialSegments={[segment]} />);
    const handle = container!.querySelector(".segment-block__resize-handle--right")!;

    dispatchPointerEvent(handle, "pointerdown", 150, 50);
    dispatchPointerEvent(window, "pointermove", 150, 90); // moved vertically too
    dispatchPointerEvent(window, "pointerup", 150, 90);

    const block = container!.querySelector(".segment-block") as HTMLElement;
    expect(block.style.top).toBe("50px"); // a resize never moves y, even if the pointer does
  });
});

describe("SegmentLayer: auto-grow height persistence (NTA-40)", () => {
  /** A minimal harness whose `segments` never change on its own — isolates `onHeightChange`'s "only when it actually differs" behavior from any store round-trip. */
  function HeightHarness({ initialHeight, onHeights }: { initialHeight: number; onHeights: (height: number) => void }) {
    const [segments] = useState<SegmentBlockData[]>([makeSegment({ id: "seg-1", visibility: "visible", height: initialHeight })]);
    return (
      <SegmentLayer
        segments={segments}
        pointerPosition={null}
        onCreateSegment={() => {}}
        onSegmentContentChange={() => {}}
        onMoveSegment={() => {}}
        onHeightChange={(_id, height) => onHeights(height)}
        onResizeSegment={() => {}}
        screenToCanvas={identityScreenToCanvas}
      />
    );
  }

  it("calls onHeightChange when the observed height differs from the segment's currently-known height", () => {
    const heights: number[] = [];
    mount(<HeightHarness initialHeight={32} onHeights={(height) => heights.push(height)} />);
    const block = container!.querySelector(".segment-block") as HTMLElement;

    act(() => simulateResize(block, 96));

    expect(heights).toEqual([96]);
  });

  it("does not call onHeightChange when the observed height matches the currently-known height", () => {
    const heights: number[] = [];
    mount(<HeightHarness initialHeight={32} onHeights={(height) => heights.push(height)} />);
    const block = container!.querySelector(".segment-block") as HTMLElement;

    act(() => simulateResize(block, 32));

    expect(heights).toEqual([]);
  });
});

describe("SegmentLayer: non-overlap during drag/resize/creation (NTA-41)", () => {
  /** True if `rect` stays at least SEGMENT_GAP clear of `neighbor` on every side — re-checks the postcondition every gesture below is supposed to guarantee, without hand-predicting which axis `resolveNonOverlap` resolves along for a given scenario. */
  function isClearOf(rect: SegmentRect, neighbor: SegmentRect, gap = SEGMENT_GAP): boolean {
    const expanded: SegmentRect = {
      x: neighbor.x - gap,
      y: neighbor.y - gap,
      width: neighbor.width + gap * 2,
      height: neighbor.height + gap * 2,
    };
    return !(
      rect.x < expanded.x + expanded.width &&
      rect.x + rect.width > expanded.x &&
      rect.y < expanded.y + expanded.height &&
      rect.y + rect.height > expanded.y
    );
  }

  it("dragging a segment toward a neighbor stops before overlapping it, maintaining the gap", () => {
    const controller = makeController();
    const mover = makeSegment({ id: "mover", visibility: "visible", x: 0, y: 0, width: 50, height: 30 });
    const neighborRect: SegmentRect = { x: 200, y: 0, width: 50, height: 30 };
    const neighbor = makeSegment({ id: "neighbor", visibility: "visible", ...neighborRect });
    mount(<DrawHarness controller={controller} initialSegments={[mover, neighbor]} />);
    const moverBlock = container!.querySelectorAll(".segment-block")[0] as HTMLElement;

    dispatchPointerEvent(moverBlock, "pointerdown", 25, 15);
    dispatchPointerEvent(window, "pointermove", 195, 15); // the raw (unclamped) target would land mover overlapping neighbor's gap zone
    dispatchPointerEvent(window, "pointerup", 195, 15);

    const moverAfter = container!.querySelectorAll(".segment-block")[0] as HTMLElement;
    const resolvedRect: SegmentRect = {
      x: parseFloat(moverAfter.style.left),
      y: parseFloat(moverAfter.style.top),
      width: 50,
      height: 30,
    };
    expect(isClearOf(resolvedRect, neighborRect)).toBe(true);
    expect(resolvedRect).not.toEqual({ x: 0, y: 0, width: 50, height: 30 }); // did move from its starting position, not just frozen there
  });

  it("resizing a segment's right edge toward a neighbor clamps the width, maintaining the gap", () => {
    const controller = makeController();
    const resizable = makeSegment({ id: "resizable", visibility: "visible", x: 0, y: 0, width: 50, height: 30 });
    const neighborRect: SegmentRect = { x: 200, y: 0, width: 50, height: 30 };
    const neighbor = makeSegment({ id: "neighbor", visibility: "visible", ...neighborRect });
    mount(<DrawHarness controller={controller} initialSegments={[resizable, neighbor]} />);
    const handle = container!.querySelector(".segment-block__resize-handle--right")!;

    dispatchPointerEvent(handle, "pointerdown", 50, 15);
    dispatchPointerEvent(window, "pointermove", 500, 15); // try to grow far past the neighbor
    dispatchPointerEvent(window, "pointerup", 500, 15);

    const block = container!.querySelectorAll(".segment-block")[0] as HTMLElement;
    const resolvedRect: SegmentRect = { x: 0, y: 0, width: parseFloat(block.style.width), height: 30 };
    expect(isClearOf(resolvedRect, neighborRect)).toBe(true);
    expect(resolvedRect.width).toBeGreaterThan(50); // did grow, just not past the neighbor
  });

  it("the invisible create-on-type gesture (NTA-37) never lands a new segment overlapping an existing one", () => {
    const controller = makeController();
    const neighborRect: SegmentRect = { x: 60, y: 0, width: 100, height: 30 };
    const neighbor = makeSegment({ id: "neighbor", visibility: "visible", ...neighborRect });
    mount(<DrawHarness controller={controller} initialPointerPosition={{ x: 40, y: 10 }} initialSegments={[neighbor]} />);

    dispatchKeyDown("H"); // pointer (40, 10) isn't inside the neighbor (60..160), but a default-width (240px) segment created there would overlap it heavily unless resolved

    const blocks = Array.from(container!.querySelectorAll(".segment-block")) as HTMLElement[];
    expect(blocks).toHaveLength(2);
    const created = blocks.find((block) => block.style.left !== "60px")!;
    const createdRect: SegmentRect = {
      x: parseFloat(created.style.left),
      y: parseFloat(created.style.top),
      width: parseFloat(created.style.width),
      height: parseFloat(created.style.minHeight),
    };
    expect(isClearOf(createdRect, neighborRect)).toBe(true);
  });

  it("deliberate visible creation (NTA-38, plain click) never lands a new segment overlapping an existing one", () => {
    const controller = makeController();
    const neighborRect: SegmentRect = { x: 60, y: 0, width: 100, height: 30 };
    const neighbor = makeSegment({ id: "neighbor", visibility: "visible", ...neighborRect });
    mount(<DrawHarness controller={controller} initialPointerPosition={{ x: 40, y: 10 }} initialSegments={[neighbor]} />);

    act(() => controller.armCreateVisible());
    dispatchPointer("pointerdown");
    dispatchPointer("pointerup");

    const blocks = Array.from(container!.querySelectorAll(".segment-block")) as HTMLElement[];
    expect(blocks).toHaveLength(2);
    const created = blocks.find((block) => block.style.left !== "60px")!;
    const createdRect: SegmentRect = {
      x: parseFloat(created.style.left),
      y: parseFloat(created.style.top),
      width: parseFloat(created.style.width),
      height: parseFloat(created.style.minHeight),
    };
    expect(isClearOf(createdRect, neighborRect)).toBe(true);
  });
});
