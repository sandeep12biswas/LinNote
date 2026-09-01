// Tells React's `act()` (used in PageHeader.test.tsx) that this jsdom
// environment is a supported test environment, silencing its "not
// configured to support act(...)" warning — same as
// packages/rich-text-engine/vitest.setup.ts and
// plugins/element-text-segment/vitest.setup.ts.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
