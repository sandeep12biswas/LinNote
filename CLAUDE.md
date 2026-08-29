# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LinNote — a cross-platform OneNote alternative built with Tauri v2 + React
19 + TypeScript, targeting Linux (primary) and Windows. Rebuilt around a
**plugin-first architecture**: formatting commands, canvas element types,
and cloud-sync providers are each an independent plugin package, not
hardcoded shell features. Full plan, tool inventory, and phase breakdown
live in `docs/architecture.md` — **read it before making architectural
decisions.** It mirrors two Notion pages ("Desing architecture" v2.2 and
"Plugins" v1.1) and supersedes an earlier draft that mentioned Excalidraw,
BlockNote, Extism, Automerge/CRDT sync, a self-hosted sync server, OCR,
and local AI via Ollama — **none of that is part of the current design.**
If you see those terms anywhere else in this repo, they're stale.

## Repo shape: pnpm workspace, not a flat app

This is a **pnpm + Turborepo monorepo**, one package per plugin, per
`docs/architecture.md`'s "Repository shape & tooling" section:

```
apps/desktop/      the Tauri v2 app (shell, registry, canvas-core, persistence)
packages/          shared, non-plugin code: plugin-sdk, plugin-playground,
                   contrast-util, rich-text-engine
plugins/           one package per feature — _template plus 15 core.* plugins
```

`npm` will not work correctly here — cross-package dependencies are
declared as `workspace:*` and only pnpm resolves those to the local
copies. **pnpm is required**, not merely assumed.

## Commands

```bash
pnpm install                                        # install every workspace package's deps
pnpm dev                                             # vite dev server for the desktop app only
pnpm tauri dev                                       # full app: Tauri window + vite dev server
pnpm --filter @linnote/plugin-format-bold dev        # one plugin, in isolation (no Tauri, no other plugins)
pnpm build                                           # turbo: build every package that needs it
pnpm typecheck                                       # tsc --noEmit across the whole workspace
pnpm lint:boundaries                                 # dependency-cruiser: fails if a plugin imports another plugin's source
pnpm test                                            # vitest across every package
pnpm create-plugin <kebab-case-name>                 # scaffold a new plugins/* package from plugins/_template
```

If `pnpm`/`turbo` aren't on `PATH`, see `docs/architecture.md`'s "Install
sequence" — this sandbox has them under `~/.npm-global/bin` (installed via
a user-local npm prefix, since Corepack couldn't symlink into `/usr/bin`
without root).

There is no lint config yet beyond the dependency-boundary check above —
don't assume `pnpm lint` covers anything more; check the relevant
`package.json` first if this changes. Test coverage is a smoke-test stub
(one manifest-id assertion) per plugin scaffold — don't claim real test
coverage exists.

**Rust/Tauri**: `rustc`/`cargo` **are installed** in this sandbox (verify
with `cargo -V` — don't assume otherwise) and `cargo check` in
`apps/desktop/src-tauri/` succeeds, including with `tauri-plugin-fs` and
`tauri-plugin-shell` as dependencies. The Linux Tauri system libraries
(`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`,
`librsvg2-dev`) are also already present — confirm with `dpkg -s
<package>` before claiming a fresh-machine gap. If a future environment
genuinely lacks the Rust toolchain, say so plainly rather than assuming
this note still applies.

```bash
cd apps/desktop/src-tauri && cargo check    # or cargo build
```

## Architecture

Three kinds of workspace package, not a monorepo of unrelated apps:

- **`apps/desktop/`** — the Tauri v2 desktop app. `src/` is the React
  frontend (Vite dev server fixed on port 1420 — Tauri expects this, see
  `vite.config.ts`/`src-tauri/tauri.conf.json`); `src-tauri/` is the Rust
  shell that compiles to the native binary, embedding the built frontend
  as `frontendDist`.
- **`packages/`** — shared code with no plugin manifest of its own:
  `plugin-sdk` (the `Plugin`/`PluginManifest`/`PluginContext` contract
  every plugin and the registry build against), `plugin-playground` (the
  harness that boots one plugin standalone), `contrast-util` (WCAG
  contrast), `rich-text-engine` (the shared TipTap wrapper).
- **`plugins/`** — one package per feature, each `@linnote/plugin-<name>`,
  each implementing `Plugin` from `@linnote/plugin-sdk`. **A plugin may
  depend only on `@linnote/plugin-sdk` and any other plugin it lists
  explicitly in its manifest's `dependencies`** — never by importing
  another plugin's source. `pnpm lint:boundaries` enforces this in CI;
  don't add a cross-plugin import that bypasses it.

### Data flow / module boundaries

`apps/desktop/src/`:

- `shell/` — menu bar, toolbar, Folder Tree pane, Page List pane; renders
  `menu`/`toolbar` contributions from the registry.
- `registry/` — plugin lifecycle: manifest read, dependency-sorted
  `activate()`, enable/disable, isolated failure handling (one broken
  plugin never takes the app down).
- `canvas-core/` — per-open-page viewport transform and the undo/redo
  command stack shared across every plugin's mutating action.
- `persistence/` — the `PersistenceProvider` interface. **v1 talks to
  `@tauri-apps/plugin-fs` directly from TypeScript** (flat JSON: `tree.json`,
  `pages/<id>.json`, `assets/<id>/...`) — there is deliberately no Rust
  `db` module for this. A future `SqlitePersistenceProvider` (via
  `tauri-plugin-sql`) is a drop-in replacement behind the same interface,
  not built yet.
- `lib/tauri.ts` — typed `invoke()` wrappers, for the rare custom
  `#[tauri::command]`. Per §8 of `docs/architecture.md`, **no bespoke
  native Rust code is required for v1** — most capabilities go through
  standard Tauri plugins (`plugin-fs`, `plugin-shell`) called directly
  from TypeScript, not through a custom command. When a capability
  genuinely does need one:
  1. Add a `#[tauri::command]` fn in `apps/desktop/src-tauri/src/commands/mod.rs`.
  2. Register it in the `tauri::generate_handler![...]` list in
     `apps/desktop/src-tauri/src/lib.rs`.
  3. Add a typed wrapper in `apps/desktop/src/lib/tauri.ts` — components
     call that, never `invoke()` directly.

Data hierarchy: `WorkspaceNode` tree (notebooks → folders → pages, an
adjacency list — navigation metadata only) is joined by id to `NotePage`
(content: header, background, `elements: CanvasElement[]`). `elements` is
an **open, plugin-extensible union** — whatever the active
`canvasElementTypes` contributions register (`SegmentBlock`, `InkStroke`,
`ImageElement`, `FileAttachment`, `YouTubeEmbed` today) — not a fixed
enum. See `apps/desktop/src/types/index.ts` for the current shape and
`docs/architecture.md` §3-§4 for the design; keep both in sync when the
model changes.

## Project tracking

Work is tracked in Jira project **NTA** (Note Taking App), issues NTA-1
through NTA-6, one per phase in `docs/architecture.md`'s "Phased
implementation plan" (§9). When picking up work, check which phase/issue
it belongs to and keep the `TODO(phase-N)` comment convention already
used throughout `plugins/*` and `apps/desktop/src/*` stub code.
