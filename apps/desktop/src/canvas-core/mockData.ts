// Seed dataset for NTA-33's in-memory `NotePage` store (./index.ts) —
// one blank page per mock `page`-type `WorkspaceNode` in
// ../workspace/mockData.ts, standing in for
// `FileSystemPersistenceProvider.readPage()` (Phase 8, NTA-69, currently
// "not implemented" on purpose — see ../persistence/index.ts) until that
// ticket lands, mirroring how NTA-49 seeded the workspace tree store.
//
// Ids/titles are hand-kept in sync with ../workspace/mockData.ts's own
// seed rather than imported from it: this store only needs matching
// `id`s (so opening one of those four pages doesn't fall through to
// `createBlankNotePage`'s synthesized default) and a title default —
// there's no other structural dependency between the two seed datasets,
// and each seeds a different store per §3/§4's "kept deliberately
// separate" data model split.
//
// Every seed page starts with an empty `elements: []` (segment blocks
// are NTA-37+, ink is a later `core.element.*` plugin — neither exists
// yet) and a light-neutral color background — the background color
// *picker* is NTA-35's scope, this just needs a sensible default with a
// real `suggestedTextColor` computed via `@linnote/contrast-util` (§6.1)
// rather than a hardcoded placeholder, since the util is already there
// to wire in.

import { suggestTextColor } from "@linnote/contrast-util";
import type { NotePage } from "../types";

const SEED_TIMESTAMP = "2026-08-01T00:00:00.000Z";

/** Light neutral "paper" default — every seed page starts on this until NTA-35's picker lets it change. */
export const DEFAULT_BACKGROUND_COLOR = "#f7f5ef";

function seedPage(id: string, title: string): NotePage {
  return {
    id,
    header: { title, align: "left" },
    background: {
      kind: "color",
      color: DEFAULT_BACKGROUND_COLOR,
      suggestedTextColor: suggestTextColor(DEFAULT_BACKGROUND_COLOR),
    },
    elements: [],
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
}

/** One entry per `page`-type `WorkspaceNode` in ../workspace/mockData.ts's `createSeedWorkspaceNodes()`. */
export function createSeedNotePages(): Record<string, NotePage> {
  return {
    "page-meeting-notes": seedPage("page-meeting-notes", "Meeting Notes"),
    "page-roadmap": seedPage("page-roadmap", "Roadmap"),
    "page-roadmap-q1": seedPage("page-roadmap-q1", "Q1 milestones"),
    "page-groceries": seedPage("page-groceries", "Groceries"),
  };
}
