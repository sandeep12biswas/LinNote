import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CREATE_VISIBLE_SEGMENT_COMMAND } from "@linnote/plugin-element-text-segment";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandBus } from "../registry";
import type { SegmentBlock } from "../types";
import { CanvasViewport } from "./CanvasViewport";
import { SegmentLayerHost } from "./SegmentLayerHost";
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

/** A minimal fake, standing in for ../registry/createContext.ts's real createCommandBus() — just enough for these tests to observe register/unregister/run. */
function makeFakeCommandBus(): CommandBus {
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  return {
    register: (id, fn) => commands.set(id, fn),
    unregister: (id) => commands.delete(id),
    run: (id, ...args) => commands.get(id)?.(...args),
    has: (id) => commands.has(id),
  };
}

function dispatchPointer(target: Element, type: "pointermove" | "pointerdown" | "pointerup"): void {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { button: 0, pointerId: 1, bubbles: true }));
  });
}

/** Like `dispatchPointer`, but with real coordinates — NTA-39's drag/reposition gesture needs `clientX`/`clientY`. */
function dispatchPointerAt(
  target: EventTarget,
  type: "pointermove" | "pointerdown" | "pointerup",
  clientX: number,
  clientY: number,
): void {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { button: 0, pointerId: 1, clientX, clientY, bubbles: true }));
  });
}

describe("SegmentLayerHost", () => {
  it("registers CREATE_VISIBLE_SEGMENT_COMMAND on mount, and running it arms + completes a visible-creation click", () => {
    const commandBus = makeFakeCommandBus();
    mount(
      <CanvasViewport pageId="page-groceries">
        <SegmentLayerHost pageId="page-groceries" commandBus={commandBus} />
      </CanvasViewport>,
    );
    const surface = container!.querySelector(".canvas-viewport")!;
    expect(commandBus.has(CREATE_VISIBLE_SEGMENT_COMMAND)).toBe(true);

    dispatchPointer(surface, "pointermove"); // establishes a live canvas-space pointer position, same as the real app's CanvasViewport tracking
    act(() => commandBus.run(CREATE_VISIBLE_SEGMENT_COMMAND)); // e.g. a toolbar click, dispatched the real way
    dispatchPointer(surface, "pointerdown");
    dispatchPointer(surface, "pointerup");

    const segments = useNotePageStore
      .getState()
      .pages["page-groceries"].elements.filter((element): element is SegmentBlock => element.type === "segment");
    expect(segments).toHaveLength(1);
    expect(segments[0].visibility).toBe("visible");
  });

  it("unregisters the command on unmount", () => {
    const commandBus = makeFakeCommandBus();
    mount(<SegmentLayerHost pageId="page-groceries" commandBus={commandBus} />);
    expect(commandBus.has(CREATE_VISIBLE_SEGMENT_COMMAND)).toBe(true);

    act(() => root!.unmount());
    root = null;

    expect(commandBus.has(CREATE_VISIBLE_SEGMENT_COMMAND)).toBe(false);
  });

  it("running the command for a page that was never opened/ensured (SegmentLayer never mounted, so the arm trigger was never supplied) does not throw", () => {
    const commandBus = makeFakeCommandBus();
    mount(<SegmentLayerHost pageId="page-never-opened-before" commandBus={commandBus} />);

    expect(() => commandBus.run(CREATE_VISIBLE_SEGMENT_COMMAND)).not.toThrow();
  });

  it("dragging an existing segment (NTA-39) updates its x/y in the real store", () => {
    const existing: SegmentBlock = {
      id: "seg-1",
      type: "segment",
      visibility: "visible",
      x: 10,
      y: 10,
      width: 100,
      height: 30,
      content: undefined,
      zIndex: 0,
    };
    useNotePageStore.setState((state) => ({
      pages: {
        ...state.pages,
        "page-groceries": { ...state.pages["page-groceries"], elements: [existing] },
      },
    }));
    const commandBus = makeFakeCommandBus();
    mount(
      <CanvasViewport pageId="page-groceries">
        <SegmentLayerHost pageId="page-groceries" commandBus={commandBus} />
      </CanvasViewport>,
    );
    const block = container!.querySelector(".segment-block") as HTMLElement;

    dispatchPointerAt(block, "pointerdown", 20, 20); // grabs the border/padding (target === currentTarget)
    dispatchPointerAt(window, "pointermove", 50, 40); // +30, +20
    dispatchPointerAt(window, "pointerup", 50, 40);

    const updated = useNotePageStore.getState().pages["page-groceries"].elements[0] as SegmentBlock;
    expect(updated.x).toBe(40);
    expect(updated.y).toBe(30);
  });

  it("dragging a segment's right resize handle (NTA-40) updates its width in the real store", () => {
    const existing: SegmentBlock = {
      id: "seg-1",
      type: "segment",
      visibility: "visible",
      x: 10,
      y: 10,
      width: 100,
      height: 30,
      content: undefined,
      zIndex: 0,
    };
    useNotePageStore.setState((state) => ({
      pages: {
        ...state.pages,
        "page-groceries": { ...state.pages["page-groceries"], elements: [existing] },
      },
    }));
    const commandBus = makeFakeCommandBus();
    mount(
      <CanvasViewport pageId="page-groceries">
        <SegmentLayerHost pageId="page-groceries" commandBus={commandBus} />
      </CanvasViewport>,
    );
    const handle = container!.querySelector(".segment-block__resize-handle--right")!;

    dispatchPointerAt(handle, "pointerdown", 110, 10); // right edge, at x = 10 + 100
    dispatchPointerAt(window, "pointermove", 150, 10); // +40
    dispatchPointerAt(window, "pointerup", 150, 10);

    const updated = useNotePageStore.getState().pages["page-groceries"].elements[0] as SegmentBlock;
    expect(updated.width).toBe(140);
    expect(updated.x).toBe(10); // unchanged
  });
});
