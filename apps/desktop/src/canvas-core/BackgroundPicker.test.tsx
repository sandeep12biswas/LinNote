import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { suggestTextColor } from "@linnote/contrast-util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackgroundPicker } from "./BackgroundPicker";
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
});

function mount(children: ReactNode): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(children));
}

/** Same native-setter workaround as ./PageHeader.test.tsx — see its comment for why. */
function setInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("BackgroundPicker", () => {
  it("renders the open page's current background color", () => {
    mount(<BackgroundPicker pageId="page-groceries" />);

    const swatch = container!.querySelector(".background-picker__swatch") as HTMLInputElement;
    expect(swatch.value).toBe(DEFAULT_BACKGROUND_COLOR);
  });

  it("picking a color updates the store's background color and recomputes suggestedTextColor", () => {
    mount(<BackgroundPicker pageId="page-groceries" />);
    const swatch = container!.querySelector(".background-picker__swatch") as HTMLInputElement;

    setInputValue(swatch, "#000000");

    const background = useNotePageStore.getState().pages["page-groceries"].background;
    expect(background.color).toBe("#000000");
    expect(background.suggestedTextColor).toBe(suggestTextColor("#000000"));
  });

  it("renders nothing for a page that hasn't been opened/ensured yet", () => {
    mount(<BackgroundPicker pageId="page-never-opened" />);

    expect(container!.innerHTML).toBe("");
  });
});
