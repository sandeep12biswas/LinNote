// NTA-34 — the page header: editable title, optional date, left/center/
// right alignment (../types#NotePage's `header` field, docs/architecture.md
// §3). Mounted by ../shell/AppShell.tsx as `CanvasViewport`'s `header`
// prop (./CanvasViewport.tsx reserves that slot for exactly this) — fixed
// on screen, outside the pan/zoom transform, regardless of zoom level.
//
// Unlike ../shell/FolderTreePane.tsx's tree-row rename (click to enter a
// transient edit mode, commit on blur/Enter), there's only ever one page
// header on screen at a time, so the title is just a plain, always-live
// `<input>` bound straight to the store — no separate edit-mode toggle
// needed. Every change (title keystroke, date toggle, alignment click)
// goes straight through `useNotePageStore`'s `updateHeader` action;
// there's no local "draft" state to commit or discard.

import { useNotePageStore } from "./index";
import type { NotePage } from "../types";

export interface PageHeaderProps {
  pageId: string;
}

const ALIGN_OPTIONS: NotePage["header"]["align"][] = ["left", "center", "right"];
const ALIGN_LABELS: Record<NotePage["header"]["align"], string> = { left: "⇤", center: "≡", right: "⇥" };

/** Today's date as `header.date`'s ISO shape — the ticket doesn't specify the initial value when the date toggle is first switched on, so this is the obvious, editable-afterward default. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PageHeader({ pageId }: PageHeaderProps) {
  const notePage = useNotePageStore((state) => state.pages[pageId]);
  const updateHeader = useNotePageStore((state) => state.updateHeader);

  if (!notePage) return null;
  const { header, background } = notePage;

  function setTitle(title: string) {
    updateHeader(pageId, (current) => ({ ...current, title }));
  }

  function setDate(date: string) {
    updateHeader(pageId, (current) => ({ ...current, date }));
  }

  function toggleDate() {
    updateHeader(pageId, (current) => ({ ...current, date: current.date === undefined ? today() : undefined }));
  }

  function setAlign(align: NotePage["header"]["align"]) {
    updateHeader(pageId, (current) => ({ ...current, align }));
  }

  return (
    <div className={`page-header page-header--${header.align}`} style={{ color: background.suggestedTextColor }}>
      <input
        className="page-header__title"
        value={header.title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="Page title"
        style={{ color: background.suggestedTextColor }}
      />

      <div className="page-header__controls">
        {header.date !== undefined ? (
          <input
            className="page-header__date"
            type="date"
            value={header.date}
            onChange={(event) => setDate(event.target.value)}
            aria-label="Page date"
          />
        ) : null}
        <button type="button" className="page-header__date-toggle" onClick={toggleDate}>
          {header.date !== undefined ? "Remove date" : "Add date"}
        </button>

        <div className="page-header__align" role="group" aria-label="Header alignment">
          {ALIGN_OPTIONS.map((align) => (
            <button
              key={align}
              type="button"
              className={`page-header__align-button${align === header.align ? " page-header__align-button--active" : ""}`}
              aria-pressed={align === header.align}
              aria-label={`Align ${align}`}
              onClick={() => setAlign(align)}
            >
              {ALIGN_LABELS[align]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
