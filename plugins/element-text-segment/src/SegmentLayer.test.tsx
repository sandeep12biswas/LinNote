import { act, useCallback, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { isPointInsideSegment, nextZIndex, SegmentLayer, type SegmentBlockData } from "./SegmentLayer";

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

  return (
    <SegmentLayer
      segments={segments}
      pointerPosition={pointerPosition}
      onCreateSegment={handleCreate}
      onSegmentContentChange={handleContentChange}
    />
  );
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
