# LinNote — Development Task List

A single ordered checklist of every Jira **NTA** story/subtask, sequenced the
way they should actually be built (not just Jira's numeric key order).
Check items off here as you close them in Jira — this file and Jira should
never drift for long; if they do, Jira is the source of truth and this file
gets corrected.

Built by cross-referencing three things as of **2026-08-30**, last updated
**2026-09-05** (Phase 8 completion): the Notion "Desing architecture" (v2.2)
and "Plugins" (v1.1) pages, the actual code in this repo (`plugins/*`,
`apps/desktop/src/*`), and every issue in Jira project NTA (NTA-1…NTA-99).
See `docs/plan.md` for the narrative gap-analysis this list was generated
from.

Legend: `[x]` done and verified in code · `[ ]` not started · 🟡 story
partially done (see its subtask checkboxes).

---

## Why this order

1. **Phase 1** is the foundation everything else activates into — already done.
2. **Finish plugin activation wiring** next: cheap (no-op stub commands, ~a
   day each), already 2/15 done, and gives every later phase a visible
   menu/toolbar hook to attach real logic to instead of wiring UI plumbing
   and feature logic at the same time. *(In practice this got deferred:
   NTA-49/50/51 landed first, and once Phase 2 was partway in-flight it made
   more sense to finish that story than context-switch back to these stub
   activations — they're still open, see the Cross-cutting section below.)*
3. **Phase 2 (Workspace hierarchy)** before the canvas: without a real
   `WorkspaceNode` tree there's no way to open a real page, so Phase 3/4 work
   would be testable only against a hardcoded stub page. **Done as of
   2026-09-01** — see below.
4. **Phase 3 → 4 → 6** (canvas → rich text/segments → collision) in one story
   (NTA-32) because each builds directly on the previous one's data model.
5. **Phase 5 (remaining formatting plugins)** right after, while the
   rich-text-engine integration from Phase 4 is still fresh — same pattern
   NTA-32/NTA-42 already establishes for bold/italic/headers.
6. **Phase 7 (attachments & embeds)** next: independent of formatting, but
   needs the canvas element-rendering path Phase 3 establishes.
7. **Phase 8 (undo/redo & full persistence)** after the editor features exist
   to undo/persist — deliberately mirrors the architecture doc's own
   ordering (build the feature surface in-memory first, wire durability
   once there's real content worth saving).
8. **Phase 9 (performance)** only makes sense once there's enough real
   content (ink, segments, panes) to actually be slow.
9. **Phase 10 (cloud sync)** last of the numbered phases — needs a stable
   persistence layer (Phase 8) to sync *from*.
10. **Phase 11 (stretch)** and the **legacy NTA-1…6** issues are out of the
    active sequence entirely — see their own sections at the bottom.

---

## Phase 1 — Plugin core & app shell ✅ DONE

Registry, manifest discovery, dependency-sorted activation, isolated failure
handling, 4-region app shell, plugin-settings persistence. Verified in code:
`apps/desktop/src/registry/`, `apps/desktop/src/shell/`.

- [x] [NTA-7](https://sandeep12biswas.atlassian.net/browse/NTA-7) — Phase 1: Plugin core & app shell
  - [x] [NTA-8](https://sandeep12biswas.atlassian.net/browse/NTA-8) Registry: manifest discovery & dependency-sorted activation order
  - [x] [NTA-9](https://sandeep12biswas.atlassian.net/browse/NTA-9) Registry: plugin lifecycle (activate/deactivate + persisted enable/disable)
  - [x] [NTA-10](https://sandeep12biswas.atlassian.net/browse/NTA-10) Registry: isolated failure handling + Settings > Plugins panel
  - [x] [NTA-11](https://sandeep12biswas.atlassian.net/browse/NTA-11) App shell: menu bar rendering
  - [x] [NTA-12](https://sandeep12biswas.atlassian.net/browse/NTA-12) App shell: toolbar rendering
  - [x] [NTA-13](https://sandeep12biswas.atlassian.net/browse/NTA-13) App shell: static 4-region layout
  - [x] [NTA-14](https://sandeep12biswas.atlassian.net/browse/NTA-14) Persistence: plugin-settings slice of FileSystemPersistenceProvider
  - [x] [NTA-15](https://sandeep12biswas.atlassian.net/browse/NTA-15) Integration: activate all 15 core.* plugins end-to-end

## Cross-cutting — Finish core.* plugin activation wiring 🟡

Originally scoped as stub (no-op) activation for every plugin, proving
registry→shell→command plumbing works end-to-end. In practice, 4 of 15 are
now done — but 2 of those (headers, text-segment) skipped the stub step
entirely and went straight to their real Phase 3/4/6 implementation
(NTA-42, NTA-37-41) once that work existed, rather than a separate
no-op-then-replace pass. **Decided or after NTA-42**: don't bother with a
throwaway stub for the rest either — most of the remaining 11 already have
a real-build ticket later in this list (Phase 5 §NTA-44 covers
font-color/font-size/bullet-list/checkbox-list/alignment; Phase 7 §NTA-45
covers file-attachment/youtube-embed; Phase 10 §NTA-48 covers both sync
providers), so their real work will close these out the same way. Ink
(NTA-25) and image (NTA-27) had no real-build ticket anywhere in this
list as of 2026-09-01 — see the new "Ink" and "Images" sections below,
added that day to close the gap.

- [ ] [NTA-16](https://sandeep12biswas.atlassian.net/browse/NTA-16) — Integration: activate all core.* plugins end-to-end 🟡
  - [x] [NTA-17](https://sandeep12biswas.atlassian.net/browse/NTA-17) core.format.bold
  - [x] [NTA-18](https://sandeep12biswas.atlassian.net/browse/NTA-18) core.format.italic
  - [ ] [NTA-19](https://sandeep12biswas.atlassian.net/browse/NTA-19) core.format.font-color
  - [ ] [NTA-20](https://sandeep12biswas.atlassian.net/browse/NTA-20) core.format.font-size
  - [x] [NTA-21](https://sandeep12biswas.atlassian.net/browse/NTA-21) core.format.headers — real implementation via NTA-42, not a separate stub
  - [ ] [NTA-22](https://sandeep12biswas.atlassian.net/browse/NTA-22) core.format.bullet-list
  - [ ] [NTA-23](https://sandeep12biswas.atlassian.net/browse/NTA-23) core.format.checkbox-list
  - [ ] [NTA-24](https://sandeep12biswas.atlassian.net/browse/NTA-24) core.format.alignment
  - [ ] [NTA-25](https://sandeep12biswas.atlassian.net/browse/NTA-25) core.element.ink — real build tracked as NTA-90 below
  - [x] [NTA-26](https://sandeep12biswas.atlassian.net/browse/NTA-26) core.element.text-segment — real implementation via NTA-37-41, not a separate stub
  - [ ] [NTA-27](https://sandeep12biswas.atlassian.net/browse/NTA-27) core.element.image — real build tracked as NTA-94 below
  - [x] [NTA-28](https://sandeep12biswas.atlassian.net/browse/NTA-28) core.element.file-attachment — real implementation via NTA-45/62, not a separate stub
  - [x] [NTA-29](https://sandeep12biswas.atlassian.net/browse/NTA-29) core.element.youtube-embed — real implementation via NTA-45/63-64, not a separate stub
  - [ ] [NTA-30](https://sandeep12biswas.atlassian.net/browse/NTA-30) core.sync.onedrive
  - [ ] [NTA-31](https://sandeep12biswas.atlassian.net/browse/NTA-31) core.sync.google-drive

## Phase 2 — Workspace hierarchy ✅ DONE

`WorkspaceNode` tree, Folder Tree + Page List panes wired to real data,
create/rename/move/delete, fractional-index ordering, trash. Blocks every
later phase from testing against a real notebook instead of a hardcoded page.

- [x] [NTA-43](https://sandeep12biswas.atlassian.net/browse/NTA-43) — Phase 2: Workspace hierarchy — all 8 subtasks merged into `feature/module-build` (2026-09-01), PR [#16](https://github.com/sandeep12biswas/LinNote/pull/16) opened against `develop`, and NTA-43/52/53/54/55/56 transitioned to Done in Jira with a summary comment on each
  - [x] [NTA-49](https://sandeep12biswas.atlassian.net/browse/NTA-49) WorkspaceNode tree data model + id-based flat storage
  - [x] [NTA-50](https://sandeep12biswas.atlassian.net/browse/NTA-50) Folder Tree pane: render folder/notebook nodes, expand/collapse, drag-to-reparent
  - [x] [NTA-51](https://sandeep12biswas.atlassian.net/browse/NTA-51) Page List pane: list pages for selected folder, nested subpages, highlight open page
  - [x] [NTA-52](https://sandeep12biswas.atlassian.net/browse/NTA-52) Structural undo stack: Move/Rename/Delete/Create commands
  - [x] [NTA-53](https://sandeep12biswas.atlassian.net/browse/NTA-53) Fractional-index sibling ordering + drag-and-drop reorder
  - [x] [NTA-54](https://sandeep12biswas.atlassian.net/browse/NTA-54) Soft-delete trash + cascade delete for folders/notebooks
  - [x] [NTA-55](https://sandeep12biswas.atlassian.net/browse/NTA-55) Breadcrumb trail above the editor canvas
  - [x] [NTA-56](https://sandeep12biswas.atlassian.net/browse/NTA-56) Lazy loading + virtualized panes + incremental title/text search index

## Phase 3 + 4 + 6 — Core note editor: canvas, segment blocks & rich text ✅ DONE

Viewport transform, ink element type, page header/background (Phase 3) →
TipTap + segment blocks + first real formatting (Phase 4) → non-overlap
block-and-snap (Phase 6), all one story since each builds on the last.

- [x] [NTA-32](https://sandeep12biswas.atlassian.net/browse/NTA-32) — Core note editor: canvas, segment blocks & rich text — all 10 subtasks merged into `feature/module-build`, transitioned to Done in Jira with a summary comment on each
  - [x] [NTA-33](https://sandeep12biswas.atlassian.net/browse/NTA-33) Canvas viewport: pan/zoom transform & render surface
  - [x] [NTA-34](https://sandeep12biswas.atlassian.net/browse/NTA-34) Page header: title, optional date & alignment
  - [x] [NTA-35](https://sandeep12biswas.atlassian.net/browse/NTA-35) Page background color + auto-contrast font suggestion
  - [x] [NTA-36](https://sandeep12biswas.atlassian.net/browse/NTA-36) Rich text engine: mount TipTap inside a canvas segment
  - [x] [NTA-37](https://sandeep12biswas.atlassian.net/browse/NTA-37) Segment block: invisible create-on-type
  - [x] [NTA-38](https://sandeep12biswas.atlassian.net/browse/NTA-38) Segment block: deliberate visible creation
  - [x] [NTA-39](https://sandeep12biswas.atlassian.net/browse/NTA-39) Segment block: drag/reposition with formatting preserved
  - [x] [NTA-40](https://sandeep12biswas.atlassian.net/browse/NTA-40) Segment block: auto-grow height & manual-resize width with reflow
  - [x] [NTA-41](https://sandeep12biswas.atlassian.net/browse/NTA-41) Segment block: non-overlap (block-and-snap) — *Phase 6*
  - [x] [NTA-42](https://sandeep12biswas.atlassian.net/browse/NTA-42) Wire real bold/italic/header formatting commands into segments

## Cross-cutting — Ink drawing (core.element.ink) ⚪ NOT STARTED

Freehand drawing — pointer capture, `perfect-freehand` outline, eraser
modes. Named in Phase 3's own description ("viewport transform, ink
element type, page header/background") but never actually included in
NTA-32, the story created for Phase 3 — this closes that gap. Not
sequenced relative to the numbered phases; core-canvas-content-shaped
like segments, so it can be picked up independent of Phase 5/7 progress.
Full undo/redo integration deferred to Phase 8 (NTA-46), same as
segment drag/resize were.

- [ ] [NTA-90](https://sandeep12biswas.atlassian.net/browse/NTA-90) — core.element.ink: freehand pointer-capture drawing (perfect-freehand + eraser)
  - [ ] [NTA-91](https://sandeep12biswas.atlassian.net/browse/NTA-91) Stroke capture & rendering: pointer capture, perfect-freehand outline, Path2D paint
  - [ ] [NTA-92](https://sandeep12biswas.atlassian.net/browse/NTA-92) Tool selection: pen/highlighter/eraser modes, color & size, toolbar-armed draw gesture
  - [ ] [NTA-93](https://sandeep12biswas.atlassian.net/browse/NTA-93) Eraser: whole-stroke and pixel/segment erase modes

## Phase 5 — Remaining formatting plugins (build) ✅ DONE

Font-color, font-size, bullet-list, checkbox-list, alignment — real logic,
beyond the stub activation above. Same pattern as NTA-42.

- [x] [NTA-44](https://sandeep12biswas.atlassian.net/browse/NTA-44) — Phase 5: Remaining formatting plugins (build)
  - [x] [NTA-57](https://sandeep12biswas.atlassian.net/browse/NTA-57) core.format.font-color: text color mark + core.util.contrast default suggestion
  - [x] [NTA-58](https://sandeep12biswas.atlassian.net/browse/NTA-58) core.format.font-size: text size mark
  - [x] [NTA-59](https://sandeep12biswas.atlassian.net/browse/NTA-59) core.format.bullet-list: bulleted list node
  - [x] [NTA-60](https://sandeep12biswas.atlassian.net/browse/NTA-60) core.format.checkbox-list: checkable to-do list node
  - [x] [NTA-61](https://sandeep12biswas.atlassian.net/browse/NTA-61) core.format.alignment: paragraph/segment alignment

## Phase 7 — Attachments & embeds (build) ✅ DONE

Real file-attachment (open in OS-default app) and YouTube-embed (inline vs.
external playback) behavior, beyond the stub activation above.

- [x] [NTA-45](https://sandeep12biswas.atlassian.net/browse/NTA-45) — Phase 7: Attachments & embeds (build) — all 4 subtasks merged into `feature/module-build` (2026-09-05), transitioned to Done in Jira with a summary comment. `@tauri-apps/plugin-dialog` added as a new standard Tauri plugin (npm + Cargo + capability) for a real native file picker, confirmed with the user first since it wasn't an explicit subtask. `tauri.conf.json`'s `shell.open` also needed a custom validation regex — the default only allows mailto/tel/http(s) links, which would have silently rejected every local file path.
  - [x] [NTA-62](https://sandeep12biswas.atlassian.net/browse/NTA-62) core.element.file-attachment: data model + icon/filename renderer + open externally
  - [x] [NTA-63](https://sandeep12biswas.atlassian.net/browse/NTA-63) core.element.youtube-embed: data model + inline sandboxed player
  - [x] [NTA-64](https://sandeep12biswas.atlassian.net/browse/NTA-64) YouTube insert-time prompt: "Play here" vs "Open in browser"
  - [x] [NTA-65](https://sandeep12biswas.atlassian.net/browse/NTA-65) fileHandlers extension point plumbing

## Cross-cutting — Images (core.element.image) ⚪ NOT STARTED

Insert via file picker, drag-and-drop, or paste; copy the source file
into workspace assets; resize via segment-style drag handles. Unlike
every other element/format plugin, image had *no* design in
`docs/architecture.md` at all before 2026-09-01 (only named in the
plugin roster and the `ImageElement` data shape) — this closes that
gap; the insertion methods/storage model/resize behavior were decided
with the user in-session rather than inherited from an existing design.
Not sequenced relative to the numbered phases; similar in spirit to
Phase 7's attachments/embeds (inserting rich content onto the canvas),
so a reasonable place to pick it up alongside or after that phase.

- [ ] [NTA-94](https://sandeep12biswas.atlassian.net/browse/NTA-94) — core.element.image: insert (file picker, drag-drop, paste), workspace-copied assets, resizable
  - [ ] [NTA-95](https://sandeep12biswas.atlassian.net/browse/NTA-95) ImageElement rendering + in-memory workspace-asset storage (foundation)
  - [ ] [NTA-96](https://sandeep12biswas.atlassian.net/browse/NTA-96) Insert via file picker
  - [ ] [NTA-97](https://sandeep12biswas.atlassian.net/browse/NTA-97) Insert via drag-and-drop onto the canvas
  - [ ] [NTA-98](https://sandeep12biswas.atlassian.net/browse/NTA-98) Insert via paste from clipboard
  - [ ] [NTA-99](https://sandeep12biswas.atlassian.net/browse/NTA-99) Resize via drag handles (segment-style)

## Phase 8 — Undo/redo, model & persistence ✅ DONE

Unified canvas command stack shared by every plugin's mutating action, plus
the rest of `FileSystemPersistenceProvider` (only the plugin-settings slice,
NTA-14, existed before this phase — `readTree`/`writePage`/etc. all threw
"not implemented" per `apps/desktop/src/persistence/index.ts`).

- [x] [NTA-46](https://sandeep12biswas.atlassian.net/browse/NTA-46) — Phase 8: Undo/redo, model & persistence — done as two commits on `feature/module-build` (2026-09-05): Pass 1 (NTA-66/67/68, commit `4c3b713`) the canvas command stack + gesture coalescing; Pass 2 (NTA-69/70/71/72, commit `b38c744`) real `FileSystemPersistenceProvider`, autosave, crash safety, schemaVersion/migration. Workspace root decided with the user: `Documents/LinNote/` (never specified in this doc before — a real gap this phase closed). Found and fixed 5 real bugs by actually driving the app end-to-end via the `run-desktop` skill (flush-before-undo timing, cross-coalescer chronological ordering, TipTap content not syncing back from an undo, a button-label collision between the two undo systems, an unhandled promise rejection in the close-flush wiring) — see the Jira comments on NTA-46 for the full list.
  - [x] [NTA-66](https://sandeep12biswas.atlassian.net/browse/NTA-66) Command interface + one undo/redo stack per open page across all plugins
  - [x] [NTA-67](https://sandeep12biswas.atlassian.net/browse/NTA-67) Gesture coalescing for fast-repeating actions
  - [x] [NTA-68](https://sandeep12biswas.atlassian.net/browse/NTA-68) Stack cap + diff-based commands
  - [x] [NTA-69](https://sandeep12biswas.atlassian.net/browse/NTA-69) FileSystemPersistenceProvider: tree/page/asset read-write
  - [x] [NTA-70](https://sandeep12biswas.atlassian.net/browse/NTA-70) Autosave: debounced canvas edits + hard flush on close
  - [x] [NTA-71](https://sandeep12biswas.atlassian.net/browse/NTA-71) Crash safety: write-to-temp-then-atomic-rename
  - [x] [NTA-72](https://sandeep12biswas.atlassian.net/browse/NTA-72) schemaVersion + migration path for page/tree/plugin-settings

## Phase 9 — Performance pass 🟡 PARTIALLY DONE

Tiled canvases, virtualized panes/segments, per-plugin code-splitting.

- [ ] [NTA-47](https://sandeep12biswas.atlassian.net/browse/NTA-47) — Phase 9: Performance pass — **partial**: NTA-75/76 done on `feature/module-build` (2026-09-05, commit `51de215`); NTA-73/74/77 intentionally deferred (see below), so the phase itself isn't closed out yet. RAF batching (NTA-75): `apps/desktop/src/canvas-core/coalescer.ts`'s `apply()` now runs on the next animation frame instead of synchronously on every `update()`, collapsing a fast pointermove stream into one apply per frame. Virtualized segments (NTA-76): `CanvasViewport.tsx` derives a canvas-space `visibleRect` from the render surface's measured size (`ResizeObserver`, same technique as NTA-56's `useElementSize`) and `SegmentLayerHost.tsx` filters against it via the new `viewportCulling.ts` (400-unit overscan margin) — a segment far outside the viewport unmounts from the DOM while its data stays untouched in `useNotePageStore`. Diagnosed and fixed a pre-existing test-flakiness trap along the way: jsdom's `pretendToBeVisual` mode runs its own real `requestAnimationFrame` driver that can race vitest's fake-timer-patched one across sequential tests in one file — `SegmentLayerHost.test.tsx` now stubs `requestAnimationFrame`/`cancelAnimationFrame` directly instead of relying on `vi.useFakeTimers()` for frame timing.
  - [ ] [NTA-73](https://sandeep12biswas.atlassian.net/browse/NTA-73) Tiled ink canvases: viewport-intersecting tiles only — deferred until Ink (NTA-90) exists; nothing to tile yet.
  - [ ] [NTA-74](https://sandeep12biswas.atlassian.net/browse/NTA-74) Static vs. active ink layer split — same reason as NTA-73.
  - [x] [NTA-75](https://sandeep12biswas.atlassian.net/browse/NTA-75) RAF batching for pointer-driven state updates
  - [x] [NTA-76](https://sandeep12biswas.atlassian.net/browse/NTA-76) Virtualized segment rendering
  - [ ] [NTA-77](https://sandeep12biswas.atlassian.net/browse/NTA-77) Per-plugin code-splitting — deferred as its own follow-up pass; `pnpm --filter desktop build` already shows the >500kB single-chunk warning this would address.

## Phase 10 — Cloud sync (build) ⚪ NOT STARTED

Real OneDrive/Google Drive `SyncProvider` implementations, beyond the stub
activation above.

- [ ] [NTA-48](https://sandeep12biswas.atlassian.net/browse/NTA-48) — Phase 10: Cloud sync (build)
  - [ ] [NTA-78](https://sandeep12biswas.atlassian.net/browse/NTA-78) Shared SyncProvider interface
  - [ ] [NTA-79](https://sandeep12biswas.atlassian.net/browse/NTA-79) core.sync.onedrive: Microsoft Graph OAuth2 + upload/download/listChanges
  - [ ] [NTA-80](https://sandeep12biswas.atlassian.net/browse/NTA-80) core.sync.google-drive: Drive API v3 OAuth2 + upload/download/listChanges
  - [ ] [NTA-81](https://sandeep12biswas.atlassian.net/browse/NTA-81) Independent per-page/per-node/per-asset sync units
  - [ ] [NTA-82](https://sandeep12biswas.atlassian.net/browse/NTA-82) Conflict handling: last-write-wins + retained conflict copy
  - [ ] [NTA-83](https://sandeep12biswas.atlassian.net/browse/NTA-83) "Edited elsewhere" warning banner on page open
  - [ ] [NTA-84](https://sandeep12biswas.atlassian.net/browse/NTA-84) Settings panel: enable OneDrive / Google Drive independently

---

## Cross-cutting — Visual design system (theming) ⚪ NOT STARTED

Not part of the original phase breakdown — added 2026-09-01 at explicit
user request, after noting the app's dark mode is just inherited
`create-tauri-app` scaffold boilerplate (one ad hoc `@media
(prefers-color-scheme: dark)` block, hardcoded hex values, no token
system, no in-app toggle) and that several recently-built components
(NTA-34/35/37/38) have zero dark-mode coverage. Purely presentational —
doesn't touch the data model — so not sequenced relative to the numbered
phases above; pick up whenever, independent of Phase 3-11 progress.

- [ ] [NTA-85](https://sandeep12biswas.atlassian.net/browse/NTA-85) — Visual design system: modern styling, selectable color themes, and dark/light mode
  - [ ] [NTA-86](https://sandeep12biswas.atlassian.net/browse/NTA-86) CSS design tokens: colors, spacing, radii, shadows, typography scale
  - [ ] [NTA-87](https://sandeep12biswas.atlassian.net/browse/NTA-87) Modern visual refresh: elevation, spacing rhythm, typography, transitions
  - [ ] [NTA-88](https://sandeep12biswas.atlassian.net/browse/NTA-88) Light/Dark mode toggle, user-selectable and persisted
  - [ ] [NTA-89](https://sandeep12biswas.atlassian.net/browse/NTA-89) Selectable color themes (accent palette presets)

---

## Phase 11 — Stretch (not sequenced, no Jira story)

Handwriting recognition, cross-page linking/backlinks,
`SqlitePersistenceProvider` migration, CRDT-based sync merge, system-wide
overlay ink, third-party plugin sandboxing (Worker/WASM, permission model,
manifest signing). Explicitly deferred post-v1 — don't create Jira stories
for these until a phase above is closer to done.

## Legacy pre-phase-breakdown issues — recommend closing, not sequencing

NTA-1…6 predate the plugin-first rewrite and reference the superseded draft
(BlockNote, Excalidraw+OCR, Automerge/Axum self-hosted sync). Their intent is
already absorbed into the phases above; don't pick up new work under these
keys.

| Issue | Status | Summary | Absorbed into |
|---|---|---|---|
| NTA-1 | ✅ Done | Install development prerequisites | — (one-off setup) |
| NTA-2 | 🟡 In Progress | Rich editor integration | Phase 3+4 (NTA-32) |
| NTA-3 | ⚪ To Do | Canvas + attachments | Phase 3 (NTA-32) + Phase 7 (NTA-45) |
| NTA-4 | ⚪ To Do | Search + tags | Phase 2 (NTA-56) + Phase 8 |
| NTA-5 | ⚪ To Do | Sync engine | Phase 10 (NTA-48) |
| NTA-6 | ⚪ To Do | Polish + packaging | Phase 9 (NTA-47) / Phase 11 |
