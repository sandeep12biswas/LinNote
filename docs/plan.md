# LinNote — Phased Implementation Plan

This mirrors the phase breakdown in `docs/architecture.md` §9, cross-referenced
against the actual state of Jira project **NTA** as of 2026-08-29. Update this
file whenever a phase's Jira mapping changes (a new Story is broken out, a
phase's scope shifts) — it's the one place to see "what phase are we on and
what's actually tracked for it," rather than re-deriving it from the Jira
backlog each time.

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

## Phase 2 — Workspace hierarchy —

`WorkspaceNode` tree, Folder Tree + Page List panes wired to real data,
create/rename/move/delete, fractional-index ordering, trash. NTA-13 (Phase 1)
only built the *static* 4-region layout with placeholder panes — the tree data
and pane behavior itself has no Jira story yet.

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

## Phase 5 — Remaining formatting plugins —

Font color (+ contrast), font size, bullet list, checkbox list, alignment —
made real (beyond the stub activation in NTA-19/20/22/23/24). No Jira story
yet; expected to follow the same pattern as NTA-32's NTA-42 once Phase 4 lands.

## Phase 6 — Segment collision handling 🟡

Non-overlap, block-and-snap.

- **NTA-32** (Story) 🟡 — continued:
  - NTA-41 ⚪ Segment block: non-overlap (block-and-snap)

## Phase 7 — Attachments & embeds —

Real file-attachment (open in OS-default app) and YouTube-embed
(inline vs. external playback prompt) behavior, beyond the stub activation in
NTA-28/29. No Jira story yet.

## Phase 8 — Undo/redo, model & persistence —

Unified canvas command stack, structural (workspace tree) command stack,
full `FileSystemPersistenceProvider` (tree/page/asset read-write, autosave).
Only the plugin-settings slice (NTA-14) exists so far. No Jira story yet for
the rest.

## Phase 9 — Performance pass ⚪

Tiled canvases, virtualized panes/segments, per-plugin code-splitting. Not
started; no Jira story yet.

## Phase 10 — Cloud sync —

OneDrive and Google Drive provider plugins, incremental per-file sync,
conflict-copy handling — beyond the stub activation in NTA-30/31. No Jira
story yet.

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
| NTA-3 | ⚪ To Do | Canvas + attachments | Phase 3 (NTA-32) + Phase 7 |
| NTA-4 | ⚪ To Do | Search + tags | Not yet mapped to a phase story (workspace search is mentioned under Phase 8's persistence design, `docs/architecture.md` §6, but has no dedicated phase slot yet) |
| NTA-5 | ⚪ To Do | Sync engine | Phase 10 |
| NTA-6 | ⚪ To Do | Polish + packaging | Phase 9 / Phase 11 |

---

## Gaps to close next

In rough priority order, the phases with **no Jira story at all** yet:

1. Phase 2 — Workspace hierarchy (blocks real Folder Tree / Page List data)
2. Phase 5 — Remaining formatting plugins (font-color/size, lists, alignment)
3. Phase 7 — Attachments & embeds (real file-open / YouTube playback)
4. Phase 8 — Undo/redo & full persistence (tree/page/asset read-write)
5. Phase 9 — Performance pass
6. Phase 10 — Cloud sync (real OAuth + sync logic)
7. Phase 11 — Stretch (not scheduled, listed for completeness)

Phase 2 is the biggest immediate gap: without real `WorkspaceNode` tree data,
Folder Tree/Page List stay placeholders no matter how far Phase 3/4 (NTA-32)
gets on the editor canvas itself.
