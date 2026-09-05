import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TOGGLE_INK_PANEL_COMMAND } from "@linnote/plugin-element-ink";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandBus } from "../registry";
import type { InkStroke } from "../types";
import { CanvasCoordinatesContext, CanvasViewport } from "./CanvasViewport";
import { EMPTY_UNDO_STACK_STATE, useCanvasCommandStore } from "./commandStack";
import { InkLayerHost } from "./InkLayerHost";
import { useNotePageStore } from "./index";
import { createSeedNotePages } from "./mockData";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  useNotePageStore.setState({ pages: createSeedNotePages() });
  useCanvasCommandStore.setState({ ...EMPTY_UNDO_STACK_STATE, pageId: null });
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

/** Mirrors SegmentLayerHost.test.tsx's own `makeFakeCommandBus`. */
function makeFakeCommandBus(): CommandBus {
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  return {
    register: (id, fn) => commands.set(id, fn),
    unregister: (id) => commands.delete(id),
    run: (id, ...args) => commands.get(id)?.(...args),
    has: (id) => commands.has(id),
  };
}

function existingStroke(overrides: Partial<InkStroke> = {}): InkStroke {
  return {
    id: "stroke-1",
    type: "ink",
    points: [
      { x: 0, y: 0, pressure: 0.5, t: 0 },
      { x: 10, y: 0, pressure: 0.5, t: 1 },
      { x: 20, y: 0, pressure: 0.5, t: 2 },
    ],
    color: "#1a1a1a",
    size: 4,
    tool: "pen",
    zIndex: 1,
    ...overrides,
  };
}

function findButton(text: string): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];
  const match = buttons.find((button) => button.textContent === text);
  if (!match) throw new Error(`no <button> with text "${text}"`);
  return match;
}

describe("InkLayerHost", () => {
  it("registers TOGGLE_INK_PANEL_COMMAND on mount, and running it shows the tool panel", () => {
    const commandBus = makeFakeCommandBus();
    mount(
      <CanvasViewport pageId="page-groceries">
        <InkLayerHost pageId="page-groceries" commandBus={commandBus} />
      </CanvasViewport>,
    );
    expect(commandBus.has(TOGGLE_INK_PANEL_COMMAND)).toBe(true);

    expect(document.querySelector(".ink-tool-panel")).toBeNull();
    act(() => commandBus.run(TOGGLE_INK_PANEL_COMMAND));
    expect(document.querySelector(".ink-tool-panel")).not.toBeNull();
  });

  it("unregisters the command on unmount", () => {
    const commandBus = makeFakeCommandBus();
    mount(<InkLayerHost pageId="page-groceries" commandBus={commandBus} />);
    expect(commandBus.has(TOGGLE_INK_PANEL_COMMAND)).toBe(true);

    act(() => root!.unmount());
    root = null;

    expect(commandBus.has(TOGGLE_INK_PANEL_COMMAND)).toBe(false);
  });

  it("running the command for a page that was never opened does not throw", () => {
    const commandBus = makeFakeCommandBus();
    mount(<InkLayerHost pageId="page-never-opened-before" commandBus={commandBus} />);

    expect(() => commandBus.run(TOGGLE_INK_PANEL_COMMAND)).not.toThrow();
  });

  it("NTA-91/66: drawing a pen stroke adds it to the store as one undoable command", () => {
    const commandBus = makeFakeCommandBus();
    mount(
      <CanvasCoordinatesContext.Provider
        value={{
          screenToCanvas: (x, y) => ({ x, y }),
          pointerPosition: { x: 0, y: 0 },
          setPanSuppressed: () => {},
          visibleRect: null,
        }}
      >
        <InkLayerHost pageId="page-groceries" commandBus={commandBus} />
      </CanvasCoordinatesContext.Provider>,
    );
    act(() => commandBus.run(TOGGLE_INK_PANEL_COMMAND));
    act(() => findButton("Pen").click());

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1, clientX: 0, clientY: 0, bubbles: true, pressure: 0.5 }));
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 20, clientY: 0, bubbles: true, pressure: 0.5 }));
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 20, clientY: 0, bubbles: true }));
    });

    const elements = useNotePageStore.getState().pages["page-groceries"].elements;
    expect(elements.filter((el) => el.type === "ink")).toHaveLength(1);
    expect(useCanvasCommandStore.getState().undoStack).toHaveLength(1);

    act(() => useCanvasCommandStore.getState().undo());
    expect(useNotePageStore.getState().pages["page-groceries"].elements.filter((el) => el.type === "ink")).toHaveLength(0);
  });

  it("NTA-93/66: whole-stroke erase removes the stroke from the store as one undoable command, restoring it on undo", () => {
    const stroke = existingStroke();
    useNotePageStore.setState((state) => ({
      pages: { ...state.pages, "page-groceries": { ...state.pages["page-groceries"], elements: [stroke] } },
    }));
    const commandBus = makeFakeCommandBus();
    mount(
      <CanvasCoordinatesContext.Provider
        value={{
          screenToCanvas: (x, y) => ({ x, y }),
          pointerPosition: { x: 10, y: 0 }, // right on the stroke
          setPanSuppressed: () => {},
          visibleRect: null,
        }}
      >
        <InkLayerHost pageId="page-groceries" commandBus={commandBus} />
      </CanvasCoordinatesContext.Provider>,
    );
    act(() => commandBus.run(TOGGLE_INK_PANEL_COMMAND));
    act(() => findButton("Eraser").click());

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1, clientX: 10, clientY: 0, bubbles: true }));
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 10, clientY: 0, bubbles: true }));
    });

    expect(useNotePageStore.getState().pages["page-groceries"].elements).toHaveLength(0);
    expect(useCanvasCommandStore.getState().undoStack).toHaveLength(1);

    act(() => useCanvasCommandStore.getState().undo());
    const restored = useNotePageStore.getState().pages["page-groceries"].elements;
    expect(restored).toHaveLength(1);
    expect(restored[0]).toEqual(stroke);
  });

  it("an eraser drag that touches nothing never reaches the undo stack", () => {
    const stroke = existingStroke();
    useNotePageStore.setState((state) => ({
      pages: { ...state.pages, "page-groceries": { ...state.pages["page-groceries"], elements: [stroke] } },
    }));
    const commandBus = makeFakeCommandBus();
    mount(
      <CanvasCoordinatesContext.Provider
        value={{
          screenToCanvas: (x, y) => ({ x, y }),
          pointerPosition: { x: 9999, y: 9999 }, // nowhere near the stroke
          setPanSuppressed: () => {},
          visibleRect: null,
        }}
      >
        <InkLayerHost pageId="page-groceries" commandBus={commandBus} />
      </CanvasCoordinatesContext.Provider>,
    );
    act(() => commandBus.run(TOGGLE_INK_PANEL_COMMAND));
    act(() => findButton("Eraser").click());

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1, clientX: 9999, clientY: 9999, bubbles: true }));
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 9999, clientY: 9999, bubbles: true }));
    });

    expect(useNotePageStore.getState().pages["page-groceries"].elements).toHaveLength(1);
    expect(useCanvasCommandStore.getState().undoStack).toHaveLength(0);
  });
});
