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
});
