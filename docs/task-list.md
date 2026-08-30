# LinNote — Development Task List

A single ordered checklist of every Jira **NTA** story/subtask, sequenced the
way they should actually be built (not just Jira's numeric key order).
Check items off here as you close them in Jira — this file and Jira should
never drift for long; if they do, Jira is the source of truth and this file
gets corrected.

Built by cross-referencing three things as of **2026-08-30**: the Notion
"Desing architecture" (v2.2) and "Plugins" (v1.1) pages, the actual code in
this repo (`plugins/*`, `apps/desktop/src/*`), and every issue in Jira
project NTA (NTA-1…NTA-84). See `docs/plan.md` for the narrative gap-analysis
this list was generated from.

Legend: `[x]` done and verified in code · `[ ]` not started · 🟡 story
partially done (see its subtask checkboxes).

---

## Why this order

1. **Phase 1** is the foundation everything else activates into — already done.
2. **Finish plugin activation wiring** next: cheap (no-op stub commands, ~a
   day each), already 2/15 done, and gives every later phase a visible
   menu/toolbar hook to attach real logic to instead of wiring UI plumbing
   and feature logic at the same time.
3. **Phase 2 (Workspace hierarchy)** before the canvas: without a real
   `WorkspaceNode` tree there's no way to open a real page, so Phase 3/4 work
   would be testable only against a hardcoded stub page.
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

Stub (no-op) activation for every plugin, proving registry→shell→command
plumbing works end-to-end. 2 of 15 done (bold, italic — verified in code as
no-op stubs with a real menu entry). Do the rest now, before diving into any
one phase below.

- [ ] [NTA-16](https://sandeep12biswas.atlassian.net/browse/NTA-16) — Integration: activate all core.* plugins end-to-end 🟡
  - [x] [NTA-17](https://sandeep12biswas.atlassian.net/browse/NTA-17) core.format.bold
  - [x] [NTA-18](https://sandeep12biswas.atlassian.net/browse/NTA-18) core.format.italic
  - [ ] [NTA-19](https://sandeep12biswas.atlassian.net/browse/NTA-19) core.format.font-color
  - [ ] [NTA-20](https://sandeep12biswas.atlassian.net/browse/NTA-20) core.format.font-size
  - [ ] [NTA-21](https://sandeep12biswas.atlassian.net/browse/NTA-21) core.format.headers
  - [ ] [NTA-22](https://sandeep12biswas.atlassian.net/browse/NTA-22) core.format.bullet-list
  - [ ] [NTA-23](https://sandeep12biswas.atlassian.net/browse/NTA-23) core.format.checkbox-list
  - [ ] [NTA-24](https://sandeep12biswas.atlassian.net/browse/NTA-24) core.format.alignment
  - [ ] [NTA-25](https://sandeep12biswas.atlassian.net/browse/NTA-25) core.element.ink
  - [ ] [NTA-26](https://sandeep12biswas.atlassian.net/browse/NTA-26) core.element.text-segment
  - [ ] [NTA-27](https://sandeep12biswas.atlassian.net/browse/NTA-27) core.element.image
  - [ ] [NTA-28](https://sandeep12biswas.atlassian.net/browse/NTA-28) core.element.file-attachment
  - [ ] [NTA-29](https://sandeep12biswas.atlassian.net/browse/NTA-29) core.element.youtube-embed
  - [ ] [NTA-30](https://sandeep12biswas.atlassian.net/browse/NTA-30) core.sync.onedrive
  - [ ] [NTA-31](https://sandeep12biswas.atlassian.net/browse/NTA-31) core.sync.google-drive

## Phase 2 — Workspace hierarchy ⚪ NOT STARTED

`WorkspaceNode` tree, Folder Tree + Page List panes wired to real data,
create/rename/move/delete, fractional-index ordering, trash. Blocks every
later phase from testing against a real notebook instead of a hardcoded page.

- [ ] [NTA-43](https://sandeep12biswas.atlassian.net/browse/NTA-43) — Phase 2: Workspace hierarchy
  - [ ] [NTA-49](https://sandeep12biswas.atlassian.net/browse/NTA-49) WorkspaceNode tree data model + id-based flat storage
  - [ ] [NTA-50](https://sandeep12biswas.atlassian.net/browse/NTA-50) Folder Tree pane: render folder/notebook nodes, expand/collapse, drag-to-reparent
  - [ ] [NTA-51](https://sandeep12biswas.atlassian.net/browse/NTA-51) Page List pane: list pages for selected folder, nested subpages, highlight open page
  - [ ] [NTA-52](https://sandeep12biswas.atlassian.net/browse/NTA-52) Structural undo stack: Move/Rename/Delete/Create commands
  - [ ] [NTA-53](https://sandeep12biswas.atlassian.net/browse/NTA-53) Fractional-index sibling ordering + drag-and-drop reorder
  - [ ] [NTA-54](https://sandeep12biswas.atlassian.net/browse/NTA-54) Soft-delete trash + cascade delete for folders/notebooks
  - [ ] [NTA-55](https://sandeep12biswas.atlassian.net/browse/NTA-55) Breadcrumb trail above the editor canvas
  - [ ] [NTA-56](https://sandeep12biswas.atlassian.net/browse/NTA-56) Lazy loading + virtualized panes + incremental title/text search index

## Phase 3 + 4 + 6 — Core note editor: canvas, segment blocks & rich text ⚪ NOT STARTED

Viewport transform, ink element type, page header/background (Phase 3) →
TipTap + segment blocks + first real formatting (Phase 4) → non-overlap
block-and-snap (Phase 6), all one story since each builds on the last.

- [ ] [NTA-32](https://sandeep12biswas.atlassian.net/browse/NTA-32) — Core note editor: canvas, segment blocks & rich text
  - [ ] [NTA-33](https://sandeep12biswas.atlassian.net/browse/NTA-33) Canvas viewport: pan/zoom transform & render surface
  - [ ] [NTA-34](https://sandeep12biswas.atlassian.net/browse/NTA-34) Page header: title, optional date & alignment
  - [ ] [NTA-35](https://sandeep12biswas.atlassian.net/browse/NTA-35) Page background color + auto-contrast font suggestion
  - [ ] [NTA-36](https://sandeep12biswas.atlassian.net/browse/NTA-36) Rich text engine: mount TipTap inside a canvas segment
  - [ ] [NTA-37](https://sandeep12biswas.atlassian.net/browse/NTA-37) Segment block: invisible create-on-type
  - [ ] [NTA-38](https://sandeep12biswas.atlassian.net/browse/NTA-38) Segment block: deliberate visible creation
  - [ ] [NTA-39](https://sandeep12biswas.atlassian.net/browse/NTA-39) Segment block: drag/reposition with formatting preserved
  - [ ] [NTA-40](https://sandeep12biswas.atlassian.net/browse/NTA-40) Segment block: auto-grow height & manual-resize width with reflow
  - [ ] [NTA-41](https://sandeep12biswas.atlassian.net/browse/NTA-41) Segment block: non-overlap (block-and-snap) — *Phase 6*
  - [ ] [NTA-42](https://sandeep12biswas.atlassian.net/browse/NTA-42) Wire real bold/italic/header formatting commands into segments

## Phase 5 — Remaining formatting plugins (build) ⚪ NOT STARTED

Font-color, font-size, bullet-list, checkbox-list, alignment — real logic,
beyond the stub activation above. Same pattern as NTA-42.

- [ ] [NTA-44](https://sandeep12biswas.atlassian.net/browse/NTA-44) — Phase 5: Remaining formatting plugins (build)
  - [ ] [NTA-57](https://sandeep12biswas.atlassian.net/browse/NTA-57) core.format.font-color: text color mark + core.util.contrast default suggestion
  - [ ] [NTA-58](https://sandeep12biswas.atlassian.net/browse/NTA-58) core.format.font-size: text size mark
  - [ ] [NTA-59](https://sandeep12biswas.atlassian.net/browse/NTA-59) core.format.bullet-list: bulleted list node
  - [ ] [NTA-60](https://sandeep12biswas.atlassian.net/browse/NTA-60) core.format.checkbox-list: checkable to-do list node
  - [ ] [NTA-61](https://sandeep12biswas.atlassian.net/browse/NTA-61) core.format.alignment: paragraph/segment alignment

## Phase 7 — Attachments & embeds (build) ⚪ NOT STARTED

Real file-attachment (open in OS-default app) and YouTube-embed (inline vs.
external playback) behavior, beyond the stub activation above.

- [ ] [NTA-45](https://sandeep12biswas.atlassian.net/browse/NTA-45) — Phase 7: Attachments & embeds (build)
  - [ ] [NTA-62](https://sandeep12biswas.atlassian.net/browse/NTA-62) core.element.file-attachment: data model + icon/filename renderer + open externally
  - [ ] [NTA-63](https://sandeep12biswas.atlassian.net/browse/NTA-63) core.element.youtube-embed: data model + inline sandboxed player
  - [ ] [NTA-64](https://sandeep12biswas.atlassian.net/browse/NTA-64) YouTube insert-time prompt: "Play here" vs "Open in browser"
  - [ ] [NTA-65](https://sandeep12biswas.atlassian.net/browse/NTA-65) fileHandlers extension point plumbing

## Phase 8 — Undo/redo, model & persistence ⚪ NOT STARTED

Unified canvas command stack shared by every plugin's mutating action, plus
the rest of `FileSystemPersistenceProvider` (only the plugin-settings slice,
NTA-14, exists today — `readTree`/`writePage`/etc. all throw
"not implemented" per `apps/desktop/src/persistence/index.ts`).

- [ ] [NTA-46](https://sandeep12biswas.atlassian.net/browse/NTA-46) — Phase 8: Undo/redo, model & persistence
  - [ ] [NTA-66](https://sandeep12biswas.atlassian.net/browse/NTA-66) Command interface + one undo/redo stack per open page across all plugins
  - [ ] [NTA-67](https://sandeep12biswas.atlassian.net/browse/NTA-67) Gesture coalescing for fast-repeating actions
  - [ ] [NTA-68](https://sandeep12biswas.atlassian.net/browse/NTA-68) Stack cap + diff-based commands
  - [ ] [NTA-69](https://sandeep12biswas.atlassian.net/browse/NTA-69) FileSystemPersistenceProvider: tree/page/asset read-write
  - [ ] [NTA-70](https://sandeep12biswas.atlassian.net/browse/NTA-70) Autosave: debounced canvas edits + hard flush on close
  - [ ] [NTA-71](https://sandeep12biswas.atlassian.net/browse/NTA-71) Crash safety: write-to-temp-then-atomic-rename
  - [ ] [NTA-72](https://sandeep12biswas.atlassian.net/browse/NTA-72) schemaVersion + migration path for page/tree/plugin-settings

## Phase 9 — Performance pass ⚪ NOT STARTED

Tiled canvases, virtualized panes/segments, per-plugin code-splitting.

- [ ] [NTA-47](https://sandeep12biswas.atlassian.net/browse/NTA-47) — Phase 9: Performance pass
  - [ ] [NTA-73](https://sandeep12biswas.atlassian.net/browse/NTA-73) Tiled ink canvases: viewport-intersecting tiles only
  - [ ] [NTA-74](https://sandeep12biswas.atlassian.net/browse/NTA-74) Static vs. active ink layer split
  - [ ] [NTA-75](https://sandeep12biswas.atlassian.net/browse/NTA-75) RAF batching for pointer-driven state updates
  - [ ] [NTA-76](https://sandeep12biswas.atlassian.net/browse/NTA-76) Virtualized segment rendering
  - [ ] [NTA-77](https://sandeep12biswas.atlassian.net/browse/NTA-77) Per-plugin code-splitting

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
