import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CanvasViewport, useCanvasCoordinates } from "./CanvasViewport";
import { useNotePageStore } from "./index";
import { createSeedNotePages } from "./mockData";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  useNotePageStore.setState({ pages: createSeedNotePages() });
});

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

function drag(surface: Element, dx: number, dy: number): void {
  act(() => {
    surface.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, clientX: 0, clientY: 0, bubbles: true }));
    surface.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 1, clientX: dx, clientY: dy, bubbles: true }),
    );
    surface.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
  });
}

function transformStyle(container: HTMLDivElement): string {
  return (container.querySelector(".canvas-viewport__transform") as HTMLElement).style.transform;
}

/** Calls `setPanSuppressed(true)` (via context) as soon as it mounts — stands in for NTA-38's drag-to-draw gesture claiming the drag instead of the viewport pan. */
function PanSuppressor() {
  const { setPanSuppressed } = useCanvasCoordinates();
  useEffect(() => {
    setPanSuppressed(true);
  }, [setPanSuppressed]);
  return null;
}

describe("CanvasViewport: pointer-drag pan", () => {
  it("pans (updates the transform) on an ordinary pointer drag", () => {
    mount(<CanvasViewport pageId="page-groceries" />);
    const surface = container!.querySelector(".canvas-viewport")!;

    drag(surface, 15, 25);

    expect(transformStyle(container!)).toBe("translate(15px, 25px) scale(1)");
  });

  it("does not pan while a `children` consumer has suppressed it via setPanSuppressed(true)", () => {
    mount(
      <CanvasViewport pageId="page-groceries">
        <PanSuppressor />
      </CanvasViewport>,
    );
    const surface = container!.querySelector(".canvas-viewport")!;

    drag(surface, 15, 25);

    expect(transformStyle(container!)).toBe("translate(0px, 0px) scale(1)");
  });
});
