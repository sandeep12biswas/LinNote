# LinNote — Architecture & Plan

> Source of truth: Notion — **"Desing architecture"** (Design & Plan, draft
> v2.2, 2026-08-29) and **"Plugins"** (repo/build strategy, draft v1.1,
> 2026-08-29), both under Note App project → Planning section. Mirrored
> here so it travels with the code; update both when the plan changes.
> This file **replaces** the earlier "Linux Note-Taking App — Architecture
> & Plan" draft (Excalidraw/BlockNote/Extism/Automerge/OCR/Ollama) — that
> draft is superseded, not layered on top of. If you find a reference to
> OCR, local AI, Extism, Automerge, or a self-hosted sync server anywhere
> else in this repo, it's stale; this document is authoritative.

A cross-platform OneNote alternative built with **Tauri v2 + React +
TypeScript**, targeting Linux (primary) and Windows. Rebuilt around a
**plugin-first architecture**: formatting commands, canvas element types,
and sync providers are each an independent, addable/removable/upgradable
module, so any one of them can be redesigned in isolation as requirements
change.

## Goals & non-goals (v1)

**Goals** — OneNote's free-flow writing/drawing; a 4-region app shell
(menu bar, folder tree, page list, editor canvas — §4 below); every
editor feature built as a plugin (§1 below); multilevel
notebook/folder/page nesting; free-form "segment blocks" for
writing/drawing anywhere; natural pen/stylus input; rich text formatting,
each control its own plugin; file attachments and YouTube embeds; cloud
sync to OneDrive and Google Drive; reliable local persistence and
undo/redo.

**Non-goals (v1)** — sandboxed third-party plugin execution (v1 plugins
are trusted, in-process TypeScript, with a path to change this, §1.5);
system-wide screen-capture ink; real-time multi-user collaboration;
CRDT-based conflict merging (v1 sync is last-write-wins with a retained
conflict copy, §7). AI features (local LLM, OCR) and a self-hosted sync
server are **out of scope** — not deferred, just not part of this design.

## 1. Plugin architecture

This is the foundation everything else builds on: *"Each feature should
be designed in a stand-alone module... plug-in style... should not be
dependent on any other feature unless explicitly documented."*

### 1.1 Plugin contract

Defined once, in `packages/plugin-sdk` (`@linnote/plugin-sdk`), and
depended on by every plugin and by the registry:

```typescript
interface PluginManifest {
  id: string;                            // namespaced, e.g. "core.format.font-color"
  name: string;
  version: string;                       // semver
  dependencies?: Record<string, string>; // pluginId -> semver range; MUST be explicit
  contributes: {
    menu?: MenuContribution[];
    toolbar?: ToolbarContribution[];
    formatCommands?: FormatCommandContribution[];
    canvasElementTypes?: CanvasElementTypeContribution[];
    syncProviders?: SyncProviderContribution[];
    fileHandlers?: FileHandlerContribution[];
    settingsPanels?: SettingsPanelContribution[];
  };
}

interface Plugin {
  manifest: PluginManifest;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(ctx: PluginContext): void | Promise<void>;
}
```

`PluginContext` is a narrow, versioned API surface (`ctx.commands`,
`ctx.menu`, `ctx.canvas`, `ctx.storage` scoped per-plugin-id,
`ctx.events`). **Plugins never import each other's internals.** If plugin
B genuinely needs plugin A's capability, B declares A in `dependencies`
and calls A only through A's published command/service id, resolved by
the registry.

### 1.2 Registry: lifecycle, dependency resolution, failure isolation

Lives in `apps/desktop/src/registry/`.

- On startup: read every known plugin's manifest (built-ins from
  `plugins/*`; user-installed ones later, §5), topologically sort by
  `dependencies`, call `activate()` in order.
- **Enable/disable** is a persisted user setting; disabling calls
  `deactivate()` and removes its contributed UI — the app keeps running
  with that feature absent.
- **Isolated failure handling**: if `activate()` throws, the registry
  catches it, marks that plugin `failed` (surfaced in a Settings > Plugins
  panel, itself plugin-contributed), and continues activating the rest.
- **Versioning**: a plugin id can be replaced by a new implementation as
  long as it keeps honoring its extension points — that's what "redesign
  in isolation" means in practice.

### 1.3 Extension points

| Extension point | Used by | Contributes |
|---|---|---|
| `menu` | App shell menu bar | Item under File/Edit/Tool/View/Format/Window/Help |
| `toolbar` | App shell toolbar | Button/dropdown bound to a command |
| `formatCommands` | Rich text engine | Named formatting op (`applyBold`, `setFontColor`, ...) |
| `canvasElementTypes` | Page document model | New canvas element kind — data shape, renderer, insert command |
| `syncProviders` | Cloud sync | A `SyncProvider` implementation |
| `fileHandlers` | File attachment plugin | Preview/open handler for a specific extension |
| `settingsPanels` | Settings UI | Configuration section for the plugin's own options |

### 1.4 Built-in features are plugins too

The app's own baseline features are ordinary plugins under a `core.*`
namespace, not hardcoded into the shell: `core.format.bold`,
`core.format.italic`, `core.format.font-color`, `core.format.font-size`,
`core.format.headers`, `core.format.bullet-list`,
`core.format.checkbox-list`, `core.format.alignment`,
`core.element.ink`, `core.element.text-segment`, `core.element.image`,
`core.element.file-attachment`, `core.element.youtube-embed`,
`core.sync.onedrive`, `core.sync.google-drive`. Every one can be
individually disabled, upgraded, or replaced the same way a hypothetical
third-party plugin would be.

### 1.5 Path to stronger isolation (planned, post-v1)

A third-party/community plugin ecosystem is a real future goal. v1
plugins stay trusted, in-process TypeScript, but the contract is kept
serializable and message-passable on purpose, so it can migrate to a
Worker/WASM sandbox later without breaking existing plugins. Before any
third-party plugin loads: (1) plugin execution moves into a Worker/WASM
runtime with a message-passing bridge, (2) a permission model for which
extension points/storage/network a plugin may request, (3) manifest
signature verification. Scheduled as a Phase 11 stretch item (§9).

The Plugins page (§6 below) specifies **Stage 1** of this path ahead of
schedule — a `.noteplugin` package format, a hosted repository index, an
in-app browser, runtime install/enable/disable/uninstall via a
local-folder dynamic loader — still trusted, in-process execution. The
three items above (Worker/WASM sandbox, permission model, manifest
signing) are **Stage 2**, still deferred.

## 2. App shell: menu, toolbar & navigation layout

4-region layout, in `apps/desktop/src/shell/`:

```
┌─────────────────────────────────────────────────────────────┐
│  Menu Bar: File  Edit  Tool  View  Format  Window  Help      │
├─────────────────────────────────────────────────────────────┤
│  Toolbar: font, size, color, B / I, alignment, lists, ...    │
├───────────────┬───────────────────┬───────────────────────────┤
│  Folder Tree   │   Page List        │                           │
│  (folders &    │   (pages in the    │      Editor Canvas        │
│   subfolders   │   selected folder) │      (§3-§5 below)        │
│   only)        │                    │                           │
└───────────────┴───────────────────┴───────────────────────────┘
```

Menu/toolbar render `menu`/`toolbar` contributions grouped by declared
top-level menu, sorted by priority. The Folder Tree pane renders only
`notebook`/`folder` nodes; the Page List pane lists `page` children of
whichever folder is selected there, with subpages shown nested/indented.
**Window scope (decided)**: single page open at a time — no tab strip,
no multi-window model; "Window" carries only standard OS window controls.

## 3. Workspace, notebook & page hierarchy

Notebooks contain folders (recursively nestable) and pages, with pages
able to have subpages — all via one adjacency-list tree, kept separate
from page content so listing/searching/reordering never loads canvas
data:

```typescript
type NodeType = "notebook" | "folder" | "page";

interface WorkspaceNode {
  id: string;                 // stable UUID, never reused
  parentId: string | null;    // null only for root-level notebooks
  type: NodeType;
  title: string;
  order: string;              // fractional-index sort key among siblings
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  trashedAt?: string | null;  // soft delete
}
```

- **IDs, not filesystem paths**: rename/move is an O(1) metadata write;
  content is stored flat, named by id (`pages/<id>.json`,
  `assets/<id>/...`), with one `tree.json` reconstructing the hierarchy.
- **Ordering**: fractional indexing (`fractional-indexing` npm package) —
  drag-and-drop reorder is a single-node write.
- **Structural operations** (`MoveNodeCommand`, `RenameNodeCommand`,
  `DeleteNodeCommand`) are undoable on a stack **separate from** the
  canvas command stack (§5.3). Deleting a folder cascades `trashedAt` to
  every descendant in one transaction.
- **Decided**: single-parent tree (no tags/multi-home) — matches OneNote;
  revisit only if a tagging model becomes a real need.
- Lazy content loading, virtualized pane rendering (`react-window`), and
  an incremental search index (`MiniSearch`) over titles/extracted text.

## 4. Page document & segment block model

```typescript
interface NotePage {
  id: string;                               // same id as its WorkspaceNode
  header: { title: string; date?: string; align: "left" | "center" | "right" };
  background: {
    kind: "color" | "pattern";
    color?: string;
    pattern?: "plain" | "ruled" | "grid" | "dotted";
    suggestedTextColor?: string;            // via @linnote/contrast-util
  };
  elements: CanvasElement[];                // open, plugin-extensible union
  createdAt: string;
  updatedAt: string;
}
```

`elements` is deliberately open-ended — whatever the active
`canvasElementTypes` contributions register, without touching this
schema. When the user picks a background color, `@linnote/contrast-util`
(WCAG relative luminance) suggests the higher-contrast of black/white as
the default font color — a small shared service both the background
picker and `core.format.font-color` depend on explicitly, rather than one
assuming the other.

**Segment blocks** (`core.element.text-segment`) are the "write/draw
anywhere" primitive: typing on empty canvas creates an **invisible**
segment sized to its content; a **visible** segment is the same model
with a shown border, created deliberately to partition the page. Height
auto-grows downward; width is user-resizable, reflowing content.
**Non-overlap (decided)**: block-and-snap — a drag/resize can't cross
into a neighbor's space, snapping to the nearest legal position at the
boundary, rather than auto-snap-to-touch or push-aside. Segment mechanics
(position, sizing, collision) and text formatting (§5) are independent
concerns with no dependency between them.

## 5. Rich text, ink, attachments & embeds

- **Rich text engine** (`packages/rich-text-engine`,
  `core.editor.rich-text-engine`): TipTap/ProseMirror, not raw
  `contenteditable` — its extension system maps directly onto
  `formatCommands`. Every `plugins/format-*` package wraps one TipTap
  extension and depends on this package explicitly, never on each other:
  `format-bold`/`format-italic` (marks), `format-font-color` (+
  `contrast-util`), `format-font-size`, `format-headers` (H1-H3),
  `format-bullet-list`, `format-checkbox-list`, `format-alignment`.
- **Ink** (`plugins/element-ink`, `core.element.ink`): pointer capture →
  `perfect-freehand` tapered outline → `Path2D` paint on one bounds-fitted
  `<canvas>` (tiled per-viewport-region rendering is NTA-73/74's later
  optimization, not this build's scope). Eraser is whole-stroke or
  pixel/segment, both undoable. `touch-action: none` (already set on
  `.canvas-viewport`, NTA-33) satisfies "no native scroll/zoom on
  pen/touch." Real build done, NTA-90/91/92/93 (2026-09-05) — this design
  predates NTA-90 but was never itself scheduled into a phase (added
  2026-09-01; see NTA-90 for the gap this closed). Tool selection is
  sticky (stays active across strokes), a `createPortal`-rendered floating
  panel (same fix `core.element.youtube-embed`'s insert dialog needed,
  NTA-64) for pen/highlighter/eraser + color/size. Now that Ink exists,
  NTA-73/74 (Phase 9) are unblocked, though not yet themselves built.
- **Images** (`plugins/element-image`, `core.element.image`): inserted
  via file picker, drag-and-drop onto the canvas, or paste from
  clipboard — the source file is copied into the page's workspace assets
  (`assets/<id>/...`, §6), so `ImageElement.assetPath` stays valid even
  if the original moves or is deleted. Resizes via the same drag-handle
  model segments use (§4), aspect-ratio-locked by default, corner
  handles rather than left/right-only since there's no text reflow to
  constrain it to one axis. Added to this doc 2026-09-01 — previously
  named only in the plugin roster (§1.4) and `ImageElement`'s own shape
  (`apps/desktop/src/types/index.ts`; this doc never described it at
  all, unlike every other element type here); real build tracked as
  NTA-94.
- **File attachments** (`plugins/element-file-attachment`,
  `core.element.file-attachment`): docx/xlsx/txt/md/etc.; double-click
  opens in the OS-default app via `@tauri-apps/plugin-shell`.
  Type-specific previews layer on afterward through the `fileHandlers`
  extension point, without modifying this plugin. Real build done, NTA-62
  (Phase 7) — `tauri.conf.json`'s `shell.open` needed a custom validation
  regex beyond its mailto/tel/http(s)-only default so a local file path
  actually passes the OS-open scope check; "Insert File Attachment" uses
  `@tauri-apps/plugin-dialog` (added alongside this ticket) for a real
  native file picker.
- **YouTube embeds** (`plugins/element-youtube-embed`,
  `core.element.youtube-embed`): a prompt at insert time —
  `inline` renders a sandboxed `youtube-nocookie.com` iframe; `external`
  opens the system browser via `shell.open`. Real build done, NTA-63/64
  (Phase 7).
- **Canvas core** (`apps/desktop/src/canvas-core/`): single
  `{x, y, scale}` viewport transform (pan/zoom rescales around the
  pointer); one linear undo/redo `Command` stack per open page, shared
  across every plugin's mutating action, distinct from the workspace
  structural stack (§3); tiled rendering, static/active layer split, RAF
  batching, virtualized off-screen segments, per-plugin code-splitting.
  Command stack + gesture coalescing real build done, NTA-66/67/68
  (Phase 8) — `commandStack.ts`/`coalescer.ts`; formatting needed zero
  `plugins/format-*` changes (every format command already flows through
  the same segment-content-change path typing does), just disabling
  TipTap's own competing `History` extension
  (`packages/rich-text-engine`). RAF batching + virtualized off-screen
  segments real build done, NTA-75/76 (Phase 9, partial — 2026-09-05):
  `coalescer.ts`'s `apply()` now runs on the next animation frame instead
  of synchronously per `update()`; `CanvasViewport.tsx` derives a
  canvas-space `visibleRect` from the render surface's measured size and
  `SegmentLayerHost.tsx` filters against it (`viewportCulling.ts`, 400-unit
  overscan) so a segment far outside the viewport unmounts from the DOM
  while its data stays in the model. Tiled ink rendering/static-active
  layer split (NTA-73/74) are unblocked now that Ink exists (NTA-90/91/
  92/93, 2026-09-05) but not yet themselves built; per-plugin
  code-splitting (NTA-77) is deferred as its own follow-up pass.

## 6. Persistence

Everything depends on one interface, `PersistenceProvider`
(`apps/desktop/src/persistence/`), never directly on
`@tauri-apps/plugin-fs` or a future `tauri-plugin-sql`:

```typescript
interface PersistenceProvider {
  readTree(): Promise<WorkspaceNode[]>;
  writeTree(nodes: WorkspaceNode[]): Promise<void>;
  readPage(id: string): Promise<NotePage>;
  writePage(id: string, page: NotePage): Promise<void>;
  deletePage(id: string): Promise<void>;
  readAsset(id: string, name: string): Promise<Blob>;
  writeAsset(id: string, name: string, data: Blob): Promise<void>;
  readPluginSettings(): Promise<PluginSettingsStore>;
  writePluginSettings(store: PluginSettingsStore): Promise<void>;
}
```

**Decided (v1): `FileSystemPersistenceProvider`** — flat JSON via
`@tauri-apps/plugin-fs` (`tree.json`, `pages/<id>.json`,
`assets/<id>/...`, `plugins.json`); workspace search runs off an
in-memory `MiniSearch` index built at startup/on save, not SQL full-text
search. **Future: `SqlitePersistenceProvider`** via `tauri-plugin-sql`,
same interface — a drop-in replacement once note volume/search/
transactional-delete correctness justify it (Phase 11 stretch, not
built now). Autosave is debounced (~800ms) with a hard flush on window
blur/close; writes are write-to-temp-then-atomic-rename; a
`schemaVersion` field enables independent migration paths per store.
**Workspace root, decided with the user (2026-09-05, NTA-69) — not
specified anywhere in this doc before, a real gap rather than an
oversight**: `Documents/LinNote/` — visible and discoverable, the way
OneNote's own notebook folder is, rather than a hidden app-managed
directory; no folder-picker UI exists yet, so v1 has exactly one, fixed
location. Real build done — see `apps/desktop/src/persistence/index.ts`
(CRUD + crash safety + schemaVersion), `workspace/index.ts` and
`canvas-core/index.ts` (load-at-startup + autosave wiring, kept out of
`persistence/` itself so the dependency arrow keeps pointing the way
this section's own opening sentence describes), and
`persistence/autosave.ts` (the window-close hard flush).

## 7. Cloud sync (OneDrive & Google Drive)

Both are `syncProviders` plugins implementing one shared interface, so
the sync engine core is provider-agnostic and a future third backend is
"write another plugin":

```typescript
interface SyncProvider {
  id: string;                                    // "core.sync.onedrive" | "core.sync.google-drive"
  authenticate(): Promise<AuthSession>;
  upload(path: string, data: Blob, meta: FileMeta): Promise<RemoteRef>;
  download(ref: RemoteRef): Promise<Blob>;
  listChanges(since: SyncCursor): Promise<ChangeSet>;
  resolveConflict(local: VersionInfo, remote: VersionInfo): Promise<Resolution>;
}
```

- **OneDrive** (`plugins/sync-onedrive`): Microsoft Graph API, OAuth2
  device/browser flow, tokens in the OS keychain via Tauri.
- **Google Drive** (`plugins/sync-google-drive`): Google Drive API v3,
  equivalent OAuth2 flow and keychain storage.
- Sync unit is per-page/per-node/per-asset, not the whole workspace as
  one blob. Users can enable one, both, or neither.
- **Conflict handling (decided)**: last-write-wins, losing version
  retained as a timestamped conflict copy, surfaced to the user — not a
  full CRDT merge. On opening a page, a lightweight metadata check
  against the active provider offers "Reload from cloud" or "Continue
  editing anyway" if a newer remote timestamp exists.

## 8. Tauri v2 / platform notes

Tauri v2 renders through the OS-native webview: WebView2 (Windows),
WKWebView (macOS), WebKitGTK (Linux). Pointer Events give real pressure
on WebView2; WKWebView has no pressure API for trackpad/mouse, so
simulated pressure is the baseline there, not a fallback edge case.
**No bespoke native Rust code is required for v1** — file
open-externally, YouTube open-in-browser, and OAuth token storage all go
through standard Tauri plugins (`plugin-shell`, OS keychain), and
persistence goes through `plugin-fs` directly from TypeScript. The
`src-tauri/src/commands/` module stays as the escape hatch for the rare
future capability that genuinely needs native Rust — see CLAUDE.md.

Out of scope for v1: system-wide overlay drawing (needs a transparent,
click-through, always-on-top window plus native global input capture —
compositor-dependent and often infeasible under Wayland).

## 9. Phased implementation plan

1. **Plugin core & app shell** — registry, manifest/lifecycle/dependency
   resolution, failure isolation; menu bar, toolbar, 4-region layout.
2. **Workspace hierarchy** — `WorkspaceNode` tree, Folder Tree + Page List
   panes, create/rename/move/delete, fractional-index ordering, trash.
3. **Core canvas** — viewport transform, pan/zoom, ink element type, page
   header + background.
4. **Rich text & segment blocks** — TipTap integration, segment block
   create/drag/auto-grow/resize, first formatting plugins (bold, italic,
   headers).
5. **Remaining formatting plugins** — font color (+ contrast), font size,
   bullet list, checkbox list, alignment.
6. **Segment collision handling** — non-overlap, block-and-snap.
7. **Attachments & embeds** — file-attachment and YouTube-embed plugins.
8. **Undo/redo, model & persistence** — unified canvas command stack,
   structural command stack, `FileSystemPersistenceProvider`.
9. **Performance pass** — tiled canvases, virtualized panes/segments,
   per-plugin code-splitting.
10. **Cloud sync** — OneDrive and Google Drive provider plugins,
    incremental per-file sync, conflict-copy handling.
11. **(Stretch)** — handwriting recognition, cross-page linking/
    backlinks, `SqlitePersistenceProvider` migration, CRDT-based sync
    merge, system-wide overlay ink, third-party plugin sandboxing
    (Worker/WASM, permission model, manifest signing).

Tracked in Jira project **NTA** (Note Taking App): NTA-1 … NTA-6 map onto
phases above (see CLAUDE.md's "Project tracking" section for the
phase-to-issue convention — update it if the phase count changes).

---

# Repository shape & tooling

_Mirrors the Notion "Plugins" page (draft v1.1)._

## 6. Repo shape: single repo, one package per plugin

**Decided**: a single repository, every plugin its own workspace
package — not separate git repos per plugin (too much overhead), not a
single undivided codebase (defeats the isolation goal). Adding a plugin
is additive: a new folder under `plugins/` with its own `package.json`;
nothing else needs to change for the workspace tooling to pick it up.

```
LinNote/
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .dependency-cruiser.cjs          # enforces §7 below in CI
├── scripts/create-plugin.mjs        # `pnpm create-plugin <name>`
├── apps/
│   └── desktop/                     # the Tauri v2 app: registry, shell, canvas core
│       ├── src-tauri/
│       └── src/
│           ├── shell/               # menu, toolbar, panes
│           ├── registry/            # plugin registry
│           ├── canvas-core/         # viewport, command stack, page document model
│           ├── persistence/         # PersistenceProvider + FileSystemPersistenceProvider
│           ├── lib/                 # invoke() wrappers for the rare custom Rust command
│           ├── store/               # zustand stores
│           └── types/               # shared domain types
├── packages/
│   ├── plugin-sdk/                  # @linnote/plugin-sdk — the contract every plugin builds against
│   ├── plugin-playground/           # shared harness that runs any one plugin standalone
│   ├── contrast-util/               # shared WCAG contrast service
│   └── rich-text-engine/            # TipTap wrapper, shared rich-text engine service
└── plugins/
    ├── _template/                   # scaffold copied to start a new plugin package
    ├── format-bold/                 # @linnote/plugin-format-bold
    ├── format-italic/
    ├── format-font-color/
    ├── format-font-size/
    ├── format-headers/
    ├── format-bullet-list/
    ├── format-checkbox-list/
    ├── format-alignment/
    ├── element-ink/
    ├── element-text-segment/
    ├── element-image/
    ├── element-file-attachment/
    ├── element-youtube-embed/
    ├── sync-onedrive/
    ├── sync-google-drive/
    └── ...                          # new plugin = new folder here
```

`pnpm-workspace.yaml` declares `apps/*`, `packages/*`, `plugins/*` as
workspace roots. Package naming: `@linnote/plugin-<kebab-case-id>` for
`plugins/*` (matching the `core.*` manifest id), `@linnote/<name>` for
`packages/*`; `apps/desktop`'s own package is named plain `desktop`.

## 7. Workspace tooling: pnpm + Turborepo

**pnpm workspaces** handle package linking (a plugin's dependency on
`@linnote/plugin-sdk`, or on another plugin where explicitly declared,
resolves to the local workspace copy automatically). **Turborepo** sits
on top for task orchestration and selective builds:

```bash
pnpm turbo build                                                                  # everything
pnpm turbo build --filter=@linnote/plugin-format-bold                             # just one plugin
pnpm turbo build --filter=@linnote/plugin-format-bold --filter=@linnote/plugin-element-ink   # a chosen few
pnpm turbo build --filter=@linnote/plugin-format-bold...                          # that plugin, plus what it depends on
pnpm turbo build --filter=[HEAD^1]                                                # only what changed since the last commit (CI)
```

Same filter syntax works for `typecheck`, `test`, and `lint`.

## 8. Running a plugin in isolation

`packages/plugin-playground` is a small Vite + React harness that boots
a single plugin against a mocked `PluginContext` — no Tauri app, no other
plugins involved. Every plugin package's own `dev` script and
`playground.tsx` entry point point the shared harness at itself:

```bash
pnpm --filter @linnote/plugin-format-bold dev     # runs just that plugin, in isolation
pnpm --filter desktop dev                          # runs the full app, all enabled plugins loaded
```

## 9. Dependency isolation, enforced

A plugin may depend only on `@linnote/plugin-sdk` and on any other plugin
it explicitly lists in its manifest's `dependencies` — never by reaching
into another plugin's internals. `.dependency-cruiser.cjs` at the repo
root makes that a build-time check, not just a convention — it fails CI
if a `plugins/*` package imports another `plugins/*` package's source
directly:

```bash
pnpm lint:boundaries
```

## 10. Adding a new plugin

```bash
pnpm create-plugin element-pdf-preview
```

Copies `plugins/_template`, fills in the package name
(`@linnote/plugin-element-pdf-preview`), leaves a starter
`src/index.ts` implementing the `Plugin` interface, a test file, and a
`playground.tsx` entry point. No central file needs editing — pnpm's
workspace glob picks up the new folder automatically.

## 11. Installable plugin distribution (Joplin-style, staged)

Modeled on Joplin's plugin mechanism — package format, searchable
repository, in-app browser, runtime install/enable/disable/uninstall, no
app rebuild required.

- **`.noteplugin` package format**: `manifest.json` (extends
  `PluginManifest` with `main`, `minAppVersion`, `author`, `homepage`,
  `checksum`, and a reserved-but-unused-in-Stage-1 `permissions` field)
  plus a `dist/` bundle.
- **Repository index**: a single hosted JSON file listing available
  plugins (id, version, description, downloadUrl, checksum).
- **In-app Plugin Browser**: a `settingsPanels` contribution — Browse
  (search/install/update-available) and Installed (enable/disable/
  uninstall), dogfooding the plugin system itself.
- **Runtime install/uninstall/update**: a local-folder dynamic loader —
  download → verify checksum → extract to `<app-data>/plugins/<id>/` →
  registry activates it, respecting §1.2's dependency resolution.
- **Stage 2, deferred**: real sandboxing (iframe/Worker boundary), the
  permission model the manifest's `permissions` field is reserved for,
  and signature verification — the same work already scoped in §1.5.

A second, separate repository — **`linnote-plugin-workshop`** — is
where *new* plugins get built going forward in full isolation from this
repo, once that phase is prioritized: same internal shape
(one package per plugin, pnpm + Turborepo, the same scaffold command),
depending on `@linnote/plugin-sdk` published to a registry rather than
resolved as a local workspace package. Not created yet — noted here so
the base `plugins/*` set in this repo is understood to stay put when it
is.

---

# Tools & software required

| Tool | Why | Status in this environment |
|---|---|---|
| Node.js 20+ | Vite, TypeScript, all frontend/plugin tooling | ✅ installed (v22) |
| **pnpm** ≥ 9 | Workspace package linking (`pnpm-workspace.yaml`) — required, not optional, once the repo has cross-package `workspace:*` dependencies | Install via corepack or npm (below) |
| **Turborepo** (`turbo`) | Task orchestration/selective builds across `apps/*`, `packages/*`, `plugins/*` | Installed as a root devDependency; a global copy is convenient for ad hoc `turbo ...` |
| Rust (`rustc`/`cargo`) | Compiles the Tauri v2 desktop shell | ✅ installed |
| Tauri CLI v2 (`@tauri-apps/cli`) | `tauri dev`/`tauri build` | ✅ workspace devDependency |
| Tauri Linux system libraries | WebKitGTK-based webview, tray icon, SVG icons | ✅ already present (see below) |
| `dependency-cruiser` | Enforces plugin import boundaries (§9) in CI | Root devDependency |
| `vitest` | Per-package unit tests (`src/index.test.ts` scaffold) | Root + per-package devDependency |
| TipTap/ProseMirror packages | Rich text engine (§5) | `packages/rich-text-engine` dependency |
| `perfect-freehand` | Ink stroke shaping (§5) | `plugins/element-ink` dependency |
| `fractional-indexing` | Sibling ordering in the workspace tree (§3) | `apps/desktop` dependency |
| `minisearch` | In-memory search index over titles/text (§6) | `apps/desktop` dependency |
| `react-window` | Virtualized Folder Tree / Page List panes (§3) | `apps/desktop` dependency |
| `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-shell` | v1 persistence + file/link opening, no custom Rust needed (§6, §8) | `apps/desktop` + `src-tauri` dependency |

Linux build prerequisites for Tauri (already installed in this sandbox —
verify with `dpkg -s <package>` on a fresh machine):

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev build-essential libssl-dev curl wget file
```

## Install sequence, from a clean machine

```bash
# 1. Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Tauri v2 Linux system libraries
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev build-essential libssl-dev curl wget file

# 3. Node.js 20+ (nvm shown; a system package manager works too)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22

# 4. pnpm, via Node's bundled Corepack (falls back to a user-local npm
#    global prefix if Corepack can't symlink into a root-owned path —
#    see "If Corepack can't write to /usr/bin" below)
corepack enable
corepack prepare pnpm@9 --activate

# 5. Install every workspace package's dependencies in one shot
pnpm install

# 6. Verify
pnpm turbo run typecheck   # TypeScript across all 21 packages
pnpm lint:boundaries       # plugin import-boundary check
cd apps/desktop/src-tauri && cargo check && cd -
```

### If Corepack can't write to `/usr/bin` (no root)

```bash
mkdir -p "$HOME/.npm-global"
npm config set prefix "$HOME/.npm-global" --location=user
npm install -g pnpm@9 turbo@2
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
```

## Everyday commands

```bash
pnpm install                                        # install every workspace package's deps
pnpm dev                                             # turbo: vite dev server for the desktop app
pnpm tauri dev                                       # full app: Tauri window + vite dev server
pnpm --filter @linnote/plugin-format-bold dev        # one plugin, in isolation (plugin-playground)
pnpm build                                           # turbo: build every package that needs it
pnpm typecheck                                       # tsc --noEmit across the whole workspace
pnpm lint:boundaries                                 # dependency-cruiser plugin isolation check
pnpm test                                            # vitest across every package
pnpm create-plugin <kebab-case-name>                 # scaffold a new plugins/* package
```

There is no test suite with real assertions yet beyond the manifest-id
smoke test each plugin scaffold ships with — see CLAUDE.md before
assuming more exists.
