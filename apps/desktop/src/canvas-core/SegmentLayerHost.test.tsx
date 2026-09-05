import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CREATE_VISIBLE_SEGMENT_COMMAND } from "@linnote/plugin-element-text-segment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandBus } from "../registry";
import type { SegmentBlock } from "../types";
import { CanvasCoordinatesContext, CanvasViewport } from "./CanvasViewport";
import { EMPTY_UNDO_STACK_STATE, useCanvasCommandStore } from "./commandStack";
import { SegmentLayerHost } from "./SegmentLayerHost";
import { useNotePageStore } from "./index";
import { createSeedNotePages } from "./mockData";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

// A manual stand-in for `requestAnimationFrame`/`cancelAnimationFrame`,
// used by the drag/resize tests below instead of
// `vi.useFakeTimers()` + `vi.advanceTimersToNextFrame()` (NTA-75's
// RAF-batched coalescer — see ./coalescer.ts). That combination works
// fine in ./coalescer.test.ts's own pure-function tests, but is
// unreliable *here*: jsdom's `pretendToBeVisual` mode (needed for this
// file's mounted `SegmentLayer`/`CanvasViewport` components) runs its
// own real `requestAnimationFrame` driver, and across several
// sequential tests in one file it sometimes wins the race against
// vitest's fake-timer-patched one — a scheduled frame silently never
// fires, and the assertion sees the pre-gesture value. Stubbing the
// globals directly with a plain array sidesteps jsdom's driver
// entirely: `flushRaf()` is the only thing that ever invokes a
// callback, so it's fully deterministic regardless of test order.
let scheduledRafCallbacks: Array<FrameRequestCallback | undefined> = [];

function flushRaf(): void {
  const callbacks = scheduledRafCallbacks;
  scheduledRafCallbacks = [];
  for (const callback of callbacks) callback?.(0);
}

beforeEach(() => {
  useNotePageStore.setState({ pages: createSeedNotePages() });
  useCanvasCommandStore.setState({ ...EMPTY_UNDO_STACK_STATE, pageId: null });
  scheduledRafCallbacks = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    scheduledRafCallbacks.push(callback);
    return scheduledRafCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    scheduledRafCallbacks[handle - 1] = undefined;
  });
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
  vi.unstubAllGlobals();
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
    act(() => flushRaf()); // NTA-75: the move is RAF-batched, not applied synchronously

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
    act(() => flushRaf()); // NTA-75: the resize is RAF-batched, not applied synchronously

    const updated = useNotePageStore.getState().pages["page-groceries"].elements[0] as SegmentBlock;
    expect(updated.width).toBe(140);
    expect(updated.x).toBe(10); // unchanged
  });

  it("NTA-66: creating a visible segment pushes an undoable command — undo() removes it", () => {
    const commandBus = makeFakeCommandBus();
    mount(
      <CanvasViewport pageId="page-groceries">
        <SegmentLayerHost pageId="page-groceries" commandBus={commandBus} />
      </CanvasViewport>,
    );
    const surface = container!.querySelector(".canvas-viewport")!;
    dispatchPointer(surface, "pointermove");
    act(() => commandBus.run(CREATE_VISIBLE_SEGMENT_COMMAND));
    dispatchPointer(surface, "pointerdown");
    dispatchPointer(surface, "pointerup");

    expect(useNotePageStore.getState().pages["page-groceries"].elements).toHaveLength(1);
    expect(useCanvasCommandStore.getState().undoStack).toHaveLength(1);

    act(() => useCanvasCommandStore.getState().undo());

    expect(useNotePageStore.getState().pages["page-groceries"].elements).toHaveLength(0);
  });

  it("NTA-66/67: dragging a segment settles into one undoable command on the canvas stack, restoring x/y on undo", () => {
    vi.useFakeTimers();
    try {
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
        pages: { ...state.pages, "page-groceries": { ...state.pages["page-groceries"], elements: [existing] } },
      }));
      const commandBus = makeFakeCommandBus();
      mount(
        <CanvasViewport pageId="page-groceries">
          <SegmentLayerHost pageId="page-groceries" commandBus={commandBus} />
        </CanvasViewport>,
      );
      const block = container!.querySelector(".segment-block") as HTMLElement;

      dispatchPointerAt(block, "pointerdown", 20, 20);
      dispatchPointerAt(window, "pointermove", 50, 40); // +30, +20
      dispatchPointerAt(window, "pointerup", 50, 40);
      act(() => flushRaf()); // NTA-75: the move is RAF-batched — flush it before checking the live value

      // Not yet settled — no command on the stack, but the live value is already applied.
      expect(useCanvasCommandStore.getState().undoStack).toHaveLength(0);
      expect((useNotePageStore.getState().pages["page-groceries"].elements[0] as SegmentBlock).x).toBe(40);

      act(() => vi.advanceTimersByTime(500));

      expect(useCanvasCommandStore.getState().undoStack).toHaveLength(1);

      act(() => useCanvasCommandStore.getState().undo());

      const reverted = useNotePageStore.getState().pages["page-groceries"].elements[0] as SegmentBlock;
      expect(reverted.x).toBe(10);
      expect(reverted.y).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it("NTA-66: auto-grow height changes are never pushed onto the canvas command stack", () => {
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
      pages: { ...state.pages, "page-groceries": { ...state.pages["page-groceries"], elements: [existing] } },
    }));
    const commandBus = makeFakeCommandBus();
    mount(
      <CanvasViewport pageId="page-groceries">
        <SegmentLayerHost pageId="page-groceries" commandBus={commandBus} />
      </CanvasViewport>,
    );

    act(() => useNotePageStore.getState().updateElement("page-groceries", "seg-1", (el) => ({ ...el, height: 80 })));

    expect(useCanvasCommandStore.getState().undoStack).toHaveLength(0);
  });

  it("NTA-76: a segment far outside visibleRect never mounts, though its data stays in the store", () => {
    const near: SegmentBlock = {
      id: "seg-near",
      type: "segment",
      visibility: "visible",
      x: 10,
      y: 10,
      width: 100,
      height: 30,
      content: undefined,
      zIndex: 0,
    };
    const far: SegmentBlock = {
      id: "seg-far",
      type: "segment",
      visibility: "visible",
      x: 100_000,
      y: 100_000,
      width: 100,
      height: 30,
      content: undefined,
      zIndex: 0,
    };
    useNotePageStore.setState((state) => ({
      pages: { ...state.pages, "page-groceries": { ...state.pages["page-groceries"], elements: [near, far] } },
    }));
    const commandBus = makeFakeCommandBus();
    // Bypasses CanvasViewport's own real (ResizeObserver-driven)
    // `visibleRect` — jsdom's ResizeObserver stub (../../vitest.setup.ts)
    // never actually calls back, so it would stay `null` here regardless
    // of what's mounted, and this test needs a concrete rect to prove the
    // filtering itself.
    mount(
      <CanvasCoordinatesContext.Provider
        value={{
          screenToCanvas: (x, y) => ({ x, y }),
          pointerPosition: null,
          setPanSuppressed: () => {},
          visibleRect: { x: 0, y: 0, width: 800, height: 600 },
        }}
      >
        <SegmentLayerHost pageId="page-groceries" commandBus={commandBus} />
      </CanvasCoordinatesContext.Provider>,
    );

    const blocks = container!.querySelectorAll(".segment-block");
    expect(blocks).toHaveLength(1); // only "seg-near" mounted

    // The model itself is untouched — "seg-far" is still there, just not rendered.
    expect(useNotePageStore.getState().pages["page-groceries"].elements).toHaveLength(2);
  });
});
