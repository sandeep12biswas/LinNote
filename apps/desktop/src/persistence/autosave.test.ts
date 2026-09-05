import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWindow = {
  onCloseRequested: vi.fn(),
  destroy: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
};

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mockWindow,
}));

import { wireHardFlushOnClose } from "./autosave";

/** Captures the handler `wireHardFlushOnClose` registers, so tests can invoke it directly instead of needing a real window-close event. */
function captureCloseHandler(): (event: { preventDefault: () => void }) => Promise<void> {
  let handler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined;
  mockWindow.onCloseRequested.mockImplementation(async (h) => {
    handler = h;
    return vi.fn(); // the unlisten fn
  });
  return (event) => handler!(event);
}

describe("wireHardFlushOnClose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prevents the default close, flushes every flushable, then destroys the window", async () => {
    const invoke = captureCloseHandler();
    const flushable = { flush: vi.fn(async () => {}) };
    await wireHardFlushOnClose(flushable);

    const preventDefault = vi.fn();
    await invoke({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(flushable.flush).toHaveBeenCalledTimes(1);
    expect(mockWindow.destroy).toHaveBeenCalledTimes(1);
  });

  it("flushes multiple flushables in parallel", async () => {
    const invoke = captureCloseHandler();
    const a = { flush: vi.fn(async () => {}) };
    const b = { flush: vi.fn(async () => {}) };
    await wireHardFlushOnClose(a, b);

    await invoke({ preventDefault: vi.fn() });

    expect(a.flush).toHaveBeenCalledTimes(1);
    expect(b.flush).toHaveBeenCalledTimes(1);
  });

  it("still destroys the window even if a flush rejects", async () => {
    const invoke = captureCloseHandler();
    const flushable = { flush: vi.fn(async () => Promise.reject(new Error("disk full"))) };
    await wireHardFlushOnClose(flushable);

    await invoke({ preventDefault: vi.fn() });

    expect(mockWindow.destroy).toHaveBeenCalledTimes(1);
  });

  it("returns the unlisten function", async () => {
    mockWindow.onCloseRequested.mockResolvedValue(vi.fn());
    const unlisten = await wireHardFlushOnClose({ flush: vi.fn(async () => {}) });
    expect(typeof unlisten).toBe("function");
  });
});
