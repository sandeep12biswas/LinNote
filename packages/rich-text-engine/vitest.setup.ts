// Tells React's `act()` (used in RichTextEngineProvider.test.tsx) that
// this jsdom environment is a supported test environment, silencing its
// "not configured to support act(...)" warning.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
