// Tells React's `act()` (used in PageHeader.test.tsx) that this jsdom
// environment is a supported test environment, silencing its "not
// configured to support act(...)" warning — same as
// packages/rich-text-engine/vitest.setup.ts and
// plugins/element-text-segment/vitest.setup.ts.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom doesn't implement the Pointer Capture APIs (used by
// CanvasViewport.test.tsx's simulated drag, via CanvasViewport.tsx's own
// setPointerCapture/hasPointerCapture/releasePointerCapture calls) —
// stub them as no-ops so a dispatched PointerEvent doesn't throw.
for (const name of ["setPointerCapture", "releasePointerCapture"] as const) {
  if (!(name in Element.prototype)) {
    Object.defineProperty(Element.prototype, name, { value: () => {}, configurable: true });
  }
}
if (!("hasPointerCapture" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "hasPointerCapture", { value: () => false, configurable: true });
}

// jsdom also doesn't implement `ResizeObserver` (used by
// plugins/element-text-segment's SegmentLayer.tsx, NTA-40's auto-grow
// height, whenever a segment renders here e.g. in
// SegmentLayerHost.test.tsx) — a no-op stub is enough here: unlike that
// plugin's own vitest.setup.ts, no desktop-level test needs to manually
// simulate a resize, just avoid the constructor throwing.
if (typeof globalThis.ResizeObserver === "undefined") {
  class NoopResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    NoopResizeObserver as unknown as typeof ResizeObserver;
}
