import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { APPLY_FONT_COLOR_COMMAND } from "@linnote/plugin-format-font-color";
import { suggestTextColor } from "@linnote/contrast-util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandBus } from "../registry";
import { FontColorHost } from "./FontColorHost";
import { useNotePageStore } from "./index";
import { createSeedNotePages, DEFAULT_BACKGROUND_COLOR } from "./mockData";

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
  document.querySelectorAll('input[type="color"]').forEach((el) => el.remove());
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

describe("FontColorHost", () => {
  it("registers the command on mount, and running it opens a picker pre-filled with the page's suggested text color", () => {
    const commandBus = makeFakeCommandBus();
    mount(<FontColorHost pageId="page-groceries" commandBus={commandBus} />);
    expect(commandBus.has(APPLY_FONT_COLOR_COMMAND)).toBe(true);

    act(() => commandBus.run(APPLY_FONT_COLOR_COMMAND));

    const input = document.querySelector('input[type="color"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value.toLowerCase()).toBe(suggestTextColor(DEFAULT_BACKGROUND_COLOR).toLowerCase());
  });

  it("unregisters the command on unmount", () => {
    const commandBus = makeFakeCommandBus();
    mount(<FontColorHost pageId="page-groceries" commandBus={commandBus} />);
    expect(commandBus.has(APPLY_FONT_COLOR_COMMAND)).toBe(true);

    act(() => root!.unmount());
    root = null;

    expect(commandBus.has(APPLY_FONT_COLOR_COMMAND)).toBe(false);
  });

  it("re-registers with a fresh default when the page's background (and suggested color) changes", () => {
    const commandBus = makeFakeCommandBus();
    mount(<FontColorHost pageId="page-groceries" commandBus={commandBus} />);

    act(() => useNotePageStore.getState().setBackgroundColor("page-groceries", "#000000"));
    act(() => commandBus.run(APPLY_FONT_COLOR_COMMAND));

    const input = document.querySelector('input[type="color"]') as HTMLInputElement;
    expect(input.value.toLowerCase()).toBe(suggestTextColor("#000000").toLowerCase());
  });

  it("running the command for a page that was never opened/ensured falls back to a default rather than throwing", () => {
    const commandBus = makeFakeCommandBus();
    mount(<FontColorHost pageId="page-never-opened-before" commandBus={commandBus} />);

    expect(() => commandBus.run(APPLY_FONT_COLOR_COMMAND)).not.toThrow();
    expect(document.querySelector('input[type="color"]')).not.toBeNull();
  });
});
