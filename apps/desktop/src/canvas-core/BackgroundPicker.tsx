// NTA-35 — the page background color picker (../types#NotePage's
// `background` field, docs/architecture.md §3/§6.1). Mounted by
// ../shell/AppShell.tsx alongside `PageHeader` (./PageHeader.tsx) in
// `CanvasViewport`'s `header` slot — fixed on screen, outside the
// pan/zoom transform. Kept as its own component rather than folded into
// `PageHeader`: NTA-34 (title/date/alignment) and NTA-35 (background
// color) are separate tickets/concerns that happen to share the same
// "fixed page-level controls" strip.
//
// Color only, not the `pattern` (ruled/grid/dotted) variant — the ticket
// asks for a "background color picker", so pattern selection stays out
// of scope here (see ./CanvasViewport.tsx's own `TODO(NTA-35)` note on
// pattern *styling*, which this doesn't touch either).
//
// The suggested font color this produces is advisory only: it's stored
// on `background.suggestedTextColor` for other UI (e.g. `PageHeader`'s
// title) to read as a default, never forced onto anything — the actual
// per-text override lives with `core.format.font-color` (Phase 5,
// NTA-57), not here.

import { useNotePageStore } from "./index";

export interface BackgroundPickerProps {
  pageId: string;
}

export function BackgroundPicker({ pageId }: BackgroundPickerProps) {
  const notePage = useNotePageStore((state) => state.pages[pageId]);
  const setBackgroundColor = useNotePageStore((state) => state.setBackgroundColor);

  if (!notePage) return null;

  return (
    <div className="background-picker">
      <label className="background-picker__label" htmlFor={`background-picker-${pageId}`}>
        Background
      </label>
      <input
        id={`background-picker-${pageId}`}
        className="background-picker__swatch"
        type="color"
        value={notePage.background.color ?? "#ffffff"}
        onChange={(event) => setBackgroundColor(pageId, event.target.value)}
      />
    </div>
  );
}
