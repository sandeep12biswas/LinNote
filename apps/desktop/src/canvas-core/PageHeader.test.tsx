import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";
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

/**
 * React overrides `HTMLInputElement.prototype.value`'s setter to track the
 * last value it rendered, so assigning `input.value = "x"` directly
 * updates that tracked value too — the subsequent dispatched `input`
 * event then looks like a no-op change and React's `onChange` never
 * fires. Going through the *native* setter (bypassing React's override)
 * is the standard workaround, same trick `@testing-library/user-event`
 * uses internally.
 */
function setInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("PageHeader", () => {
  it("renders the open page's current title, and edits update the store", () => {
    mount(<PageHeader pageId="page-groceries" />);

    const titleInput = container!.querySelector(".page-header__title") as HTMLInputElement;
    expect(titleInput.value).toBe("Groceries");

    setInputValue(titleInput, "Weekly Shopping");

    expect(useNotePageStore.getState().pages["page-groceries"].header.title).toBe("Weekly Shopping");
  });

  it("has no date field until toggled on, then adds one defaulting to today, editable, and removable", () => {
    mount(<PageHeader pageId="page-groceries" />);

    expect(container!.querySelector(".page-header__date")).toBeNull();

    const toggle = container!.querySelector(".page-header__date-toggle") as HTMLButtonElement;
    expect(toggle.textContent).toBe("Add date");

    act(() => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const todayIso = new Date().toISOString().slice(0, 10);
    expect(useNotePageStore.getState().pages["page-groceries"].header.date).toBe(todayIso);
    const dateInput = container!.querySelector(".page-header__date") as HTMLInputElement;
    expect(dateInput.value).toBe(todayIso);

    setInputValue(dateInput, "2026-12-25");
    expect(useNotePageStore.getState().pages["page-groceries"].header.date).toBe("2026-12-25");

    const removeToggle = container!.querySelector(".page-header__date-toggle") as HTMLButtonElement;
    expect(removeToggle.textContent).toBe("Remove date");
    act(() => removeToggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(useNotePageStore.getState().pages["page-groceries"].header.date).toBeUndefined();
    expect(container!.querySelector(".page-header__date")).toBeNull();
  });

  it("defaults to left alignment, and clicking an alignment button updates the store and the active class", () => {
    mount(<PageHeader pageId="page-groceries" />);

    expect(container!.querySelector(".page-header")!.className).toContain("page-header--left");

    const rightButton = container!.querySelector('[aria-label="Align right"]') as HTMLButtonElement;
    act(() => rightButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(useNotePageStore.getState().pages["page-groceries"].header.align).toBe("right");
    expect(container!.querySelector(".page-header")!.className).toContain("page-header--right");
    expect(rightButton.className).toContain("page-header__align-button--active");
  });

  it("renders nothing for a page that hasn't been opened/ensured yet", () => {
    mount(<PageHeader pageId="page-never-opened" />);

    expect(container!.innerHTML).toBe("");
  });
});
