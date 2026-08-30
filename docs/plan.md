# LinNote — Phased Implementation Plan

This mirrors the phase breakdown in `docs/architecture.md` §9, cross-referenced
against the actual state of Jira project **NTA** as of 2026-08-30. Update this
file whenever a phase's Jira mapping changes (a new Story is broken out, a
phase's scope shifts) — it's the one place to see "what phase are we on and
what's actually tracked for it," rather than re-deriving it from the Jira
backlog each time.

Every phase now has a Jira story (NTA-43…NTA-84, added 2026-08-30, closed the
gaps this file originally flagged) — see `docs/task-list.md` for the same
data as a single ordered, checkable list in recommended build sequence.

Legend: ✅ Done · 🟡 In progress / partially tracked · ⚪ Not started · —
Not yet broken into a Jira story (a gap, not a "won't do").

---

## Phase 1 — Plugin core & app shell ✅

Registry (manifest discovery, dependency-sorted activation, enable/disable,
isolated failure handling) and the 4-region app shell (menu bar, toolbar,
static layout).

- **NTA-7** (Story) ✅ — Phase 1: Plugin core & app shell
  - NTA-8 ✅ Registry: manifest discovery & dependency-sorted activation order
  - NTA-9 ✅ Registry: plugin lifecycle (activate/deactivate + persisted enable/disable)
  - NTA-10 ✅ Registry: isolated failure handling + Settings > Plugins panel
  - NTA-11 ✅ App shell: menu bar rendering
  - NTA-12 ✅ App shell: toolbar rendering
  - NTA-13 ✅ App shell: static 4-region layout
  - NTA-14 ✅ Persistence: plugin-settings slice of `FileSystemPersistenceProvider`
  - NTA-15 ✅ Integration: activate all 15 core.* plugins end-to-end (all-at-once approach)

**Follow-up — per-plugin activation re-tracking:**

- **NTA-16** (Story) 🟡 — same integration goal as NTA-15, re-broken into one
  subtask per plugin so each can be verified/merged independently. Tracking-only
  parent; PR #13 (NTA-15's commit) already merged all 15 into `develop`, so most
  of these subtasks are expected to be verify-and-close, not new code.
  - NTA-17 ✅ `core.format.bold` — verified already satisfied by PR #13
  - NTA-18 ✅ `core.format.italic` — verified already satisfied by PR #13
  - NTA-19 ⚪ `core.format.font-color`
  - NTA-20 ⚪ `core.format.font-size`
  - NTA-21 ⚪ `core.format.headers`
  - NTA-22 ⚪ `core.format.bullet-list`
  - NTA-23 ⚪ `core.format.checkbox-list`
  - NTA-24 ⚪ `core.format.alignment`
  - NTA-25 ⚪ `core.element.ink`
  - NTA-26 ⚪ `core.element.text-segment`
  - NTA-27 ⚪ `core.element.image`
  - NTA-28 ⚪ `core.element.file-attachment`
  - NTA-29 ⚪ `core.element.youtube-embed`
  - NTA-30 ⚪ `core.sync.onedrive`
  - NTA-31 ⚪ `core.sync.google-drive`

## Phase 2 — Workspace hierarchy ⚪

`WorkspaceNode` tree, Folder Tree + Page List panes wired to real data,
create/rename/move/delete, fractional-index ordering, trash. NTA-13 (Phase 1)
only built the *static* 4-region layout with placeholder panes — this phase
wires the tree data and real pane behavior.

- **NTA-43** (Story) ⚪ — Phase 2: Workspace hierarchy
  - NTA-49 ⚪ WorkspaceNode tree data model + id-based flat storage
  - NTA-50 ⚪ Folder Tree pane: render folder/notebook nodes, expand/collapse, drag-to-reparent
  - NTA-51 ⚪ Page List pane: list pages for selected folder, nested subpages, highlight open page
  - NTA-52 ⚪ Structural undo stack: Move/Rename/Delete/Create commands
  - NTA-53 ⚪ Fractional-index sibling ordering + drag-and-drop reorder
  - NTA-54 ⚪ Soft-delete trash + cascade delete for folders/notebooks
  - NTA-55 ⚪ Breadcrumb trail above the editor canvas
  - NTA-56 ⚪ Lazy loading + virtualized panes + incremental title/text search index

## Phase 3 — Core canvas 🟡

Viewport transform, pan/zoom, ink element type, page header + background.

- **NTA-32** (Story) 🟡 — Core note editor: canvas, segment blocks & rich text
  (this story spans Phases 3, 4, and the Phase 6 non-overlap rule — see below)
  - NTA-33 ⚪ Canvas viewport: pan/zoom transform & render surface
  - NTA-34 ⚪ Page header: title, optional date & alignment
  - NTA-35 ⚪ Page background color + auto-contrast font suggestion
- Ink element type real rendering — not yet a story (NTA-25 above is stub
  activation only).

## Phase 4 — Rich text & segment blocks 🟡

TipTap integration, segment block create/drag/auto-grow/resize, first
formatting plugins (bold, italic, headers) made real.

- **NTA-32** (Story) 🟡 — continued from Phase 3:
  - NTA-36 ⚪ Rich text engine: mount TipTap inside a canvas segment
  - NTA-37 ⚪ Segment block: invisible create-on-type
  - NTA-38 ⚪ Segment block: deliberate visible creation
  - NTA-39 ⚪ Segment block: drag/reposition with formatting preserved
  - NTA-40 ⚪ Segment block: auto-grow height & manual-resize width with reflow
  - NTA-42 ⚪ Wire real bold/italic/header formatting commands into segments

## Phase 5 — Remaining formatting plugins ⚪

Font color (+ contrast), font size, bullet list, checkbox list, alignment —
made real (beyond the stub activation in NTA-19/20/22/23/24), following the
same pattern as NTA-32's NTA-42.

- **NTA-44** (Story) ⚪ — Phase 5: Remaining formatting plugins (build)
  - NTA-57 ⚪ core.format.font-color: text color mark + core.util.contrast default suggestion
  - NTA-58 ⚪ core.format.font-size: text size mark
  - NTA-59 ⚪ core.format.bullet-list: bulleted list node
  - NTA-60 ⚪ core.format.checkbox-list: checkable to-do list node
  - NTA-61 ⚪ core.format.alignment: paragraph/segment alignment

## Phase 6 — Segment collision handling 🟡

Non-overlap, block-and-snap.

- **NTA-32** (Story) 🟡 — continued:
  - NTA-41 ⚪ Segment block: non-overlap (block-and-snap)

## Phase 7 — Attachments & embeds ⚪

Real file-attachment (open in OS-default app) and YouTube-embed
(inline vs. external playback prompt) behavior, beyond the stub activation in
NTA-28/29.

- **NTA-45** (Story) ⚪ — Phase 7: Attachments & embeds (build)
  - NTA-62 ⚪ core.element.file-attachment: data model + icon/filename renderer + open externally
  - NTA-63 ⚪ core.element.youtube-embed: data model + inline sandboxed player
  - NTA-64 ⚪ YouTube insert-time prompt: "Play here" vs "Open in browser"
  - NTA-65 ⚪ fileHandlers extension point plumbing

## Phase 8 — Undo/redo, model & persistence ⚪

Unified canvas command stack, structural (workspace tree) command stack,
full `FileSystemPersistenceProvider` (tree/page/asset read-write, autosave).
Only the plugin-settings slice (NTA-14) exists so far.

- **NTA-46** (Story) ⚪ — Phase 8: Undo/redo, model & persistence
  - NTA-66 ⚪ Command interface + one undo/redo stack per open page across all plugins
  - NTA-67 ⚪ Gesture coalescing for fast-repeating actions
  - NTA-68 ⚪ Stack cap + diff-based commands
  - NTA-69 ⚪ FileSystemPersistenceProvider: tree/page/asset read-write
  - NTA-70 ⚪ Autosave: debounced canvas edits + hard flush on close
  - NTA-71 ⚪ Crash safety: write-to-temp-then-atomic-rename
  - NTA-72 ⚪ schemaVersion + migration path for page/tree/plugin-settings

## Phase 9 — Performance pass ⚪

Tiled canvases, virtualized panes/segments, per-plugin code-splitting.

- **NTA-47** (Story) ⚪ — Phase 9: Performance pass
  - NTA-73 ⚪ Tiled ink canvases: viewport-intersecting tiles only
  - NTA-74 ⚪ Static vs. active ink layer split
  - NTA-75 ⚪ RAF batching for pointer-driven state updates
  - NTA-76 ⚪ Virtualized segment rendering
  - NTA-77 ⚪ Per-plugin code-splitting

## Phase 10 — Cloud sync ⚪

OneDrive and Google Drive provider plugins, incremental per-file sync,
conflict-copy handling — beyond the stub activation in NTA-30/31.

- **NTA-48** (Story) ⚪ — Phase 10: Cloud sync (build)
  - NTA-78 ⚪ Shared SyncProvider interface
  - NTA-79 ⚪ core.sync.onedrive: Microsoft Graph OAuth2 + upload/download/listChanges
  - NTA-80 ⚪ core.sync.google-drive: Drive API v3 OAuth2 + upload/download/listChanges
  - NTA-81 ⚪ Independent per-page/per-node/per-asset sync units
  - NTA-82 ⚪ Conflict handling: last-write-wins + retained conflict copy
  - NTA-83 ⚪ "Edited elsewhere" warning banner on page open
  - NTA-84 ⚪ Settings panel: enable OneDrive / Google Drive independently

## Phase 11 — Stretch ⚪

Handwriting recognition, cross-page linking/backlinks,
`SqlitePersistenceProvider` migration, CRDT-based sync merge, system-wide
overlay ink, third-party plugin sandboxing (Worker/WASM, permission model,
manifest signing). Explicitly deferred — not scheduled.

---

## Legacy pre-phase-breakdown tasks (NTA-1..6)

These predate the Phase 1-11 breakdown above and referenced an earlier plan
(BlockNote, Excalidraw+OCR, Automerge/Axum self-hosted sync) that
`docs/architecture.md`'s 2026-08-29 rebuild replaced (see NTA-7's own note).
Kept for history; their intent is absorbed into the phases above:

| Issue | Status | Summary | Absorbed into |
|---|---|---|---|
| NTA-1 | ✅ Done | Install development prerequisites | — (one-off setup, no phase mapping needed) |
| NTA-2 | 🟡 In Progress | Rich editor integration | Phase 3 + 4 (NTA-32) |
| NTA-3 | ⚪ To Do | Canvas + attachments | Phase 3 (NTA-32) + Phase 7 (NTA-45) |
| NTA-4 | ⚪ To Do | Search + tags | Phase 2 (NTA-56) + Phase 8 (NTA-46) |
| NTA-5 | ⚪ To Do | Sync engine | Phase 10 (NTA-48) |
| NTA-6 | ⚪ To Do | Polish + packaging | Phase 9 (NTA-47) / Phase 11 |

---

## Recommended build order

Every phase now has a Jira story — NTA-43…NTA-48, added 2026-08-30, cover
what used to be gaps. Rough build order, with reasoning:

1. Finish the remaining NTA-16 stub activations (NTA-19…31) — cheap, already
   half done, gives every phase below a visible menu/toolbar hook to build
   real logic against.
2. Phase 2 — Workspace hierarchy (NTA-43) — blocks real Folder Tree / Page
   List data; nothing else can be tested against a real page without it.
3. Phase 3 + 4 + 6 — Core note editor: canvas, segment blocks & rich text
   (NTA-32) — each sub-piece builds directly on the last.
4. Phase 5 — Remaining formatting plugins, build (NTA-44).
5. Phase 7 — Attachments & embeds, build (NTA-45).
6. Phase 8 — Undo/redo & full persistence (NTA-46).
7. Phase 9 — Performance pass (NTA-47).
8. Phase 10 — Cloud sync, build (NTA-48).
9. Phase 11 — Stretch (not scheduled, no Jira story — intentionally last).

See `docs/task-list.md` for this same order as a single flat, checkable list
across all 84 issues.
