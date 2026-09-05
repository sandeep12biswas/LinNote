// Tells React's `act()` (used in SegmentLayer.test.tsx) that this jsdom
// environment is a supported test environment, silencing its "not
// configured to support act(...)" warning — same as
// packages/rich-text-engine/vitest.setup.ts.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom doesn't implement `ResizeObserver` at all, and can't perform
// real CSS layout regardless — so there's no way to trigger a "real"
// measured-size change in a test (see SegmentLayer.tsx's `NTA-40`
// header-comment section for the full explanation). This fake just
// records which callback is observing which element, so
// SegmentLayer.test.tsx can manually simulate one via `simulateResize`
// below — enough to verify the *wiring* (mount -> observe ->
// onHeightChange when the observer fires), not real rendering.
interface FakeObservation {
  target: Element;
  callback: ResizeObserverCallback;
}

const fakeObservations: FakeObservation[] = [];

class FakeResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    fakeObservations.push({ target, callback: this.callback });
  }

  unobserve(target: Element): void {
    const index = fakeObservations.findIndex((entry) => entry.target === target && entry.callback === this.callback);
    if (index !== -1) fakeObservations.splice(index, 1);
  }

  disconnect(): void {
    for (let i = fakeObservations.length - 1; i >= 0; i--) {
      if (fakeObservations[i].callback === this.callback) fakeObservations.splice(i, 1);
    }
  }
}

(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  FakeResizeObserver as unknown as typeof ResizeObserver;

/** Test helper: fires every `ResizeObserver` callback currently observing `target` as though it measured `height`. */
export function simulateResize(target: Element, height: number): void {
  for (const entry of fakeObservations) {
    if (entry.target !== target) continue;
    const fakeEntry = {
      target,
      contentRect: { height } as DOMRectReadOnly,
      borderBoxSize: [{ blockSize: height, inlineSize: 0 }] as unknown as ReadonlyArray<ResizeObserverSize>,
    } as unknown as ResizeObserverEntry;
    entry.callback([fakeEntry], undefined as unknown as ResizeObserver);
  }
}
