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
