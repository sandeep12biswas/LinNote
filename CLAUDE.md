# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LinNote — a cross-platform OneNote alternative built with Tauri v2 + React
19 + TypeScript, targeting Linux (primary) and Windows. Offline-first,
self-hostable sync, local AI via Ollama. Full plan, tech-stack rationale,
and phase breakdown live in `docs/architecture.md` — read it before
making architectural decisions, since most of the codebase is currently
stubs that exist to hold that plan's shape.

## Commands

Package manager is npm (`package-lock.json` is committed; `pnpm` is what
the plan doc assumes but isn't installed in this environment — either
works, don't mix lockfiles).

```bash
npm install              # install frontend deps
npm run dev               # vite dev server only (frontend, no Tauri window)
npm run tauri dev         # full app: Tauri window + vite dev server (needs Rust + Tauri Linux deps)
npm run build              # tsc typecheck + vite build
npx tsc --noEmit           # typecheck only, no build output
```

There is no test suite yet, and no lint config yet — don't assume
`npm test` or `npm run lint` exist; check `package.json` first if this
changes.

The Rust side (`src-tauri/`, `server/`) requires `rustc`/`cargo`, which
are **not installed** in this sandbox. Frontend-only changes can be
verified with `npx tsc --noEmit`; Rust changes cannot be compiled or
tested here — say so rather than claiming a build passed.

```bash
# src-tauri/: the desktop app's Rust backend
cd src-tauri && cargo build
cd src-tauri && cargo check

# server/: optional self-hosted sync server, a separate crate
cd server && cargo build
cd server && docker compose up   # runs server + Postgres + MinIO
```

Linux build prerequisites for Tauri (see `docs/architecture.md`):
`libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`.

## Architecture

Three independent build units, not a monorepo workspace:

- **`src/`** — React frontend, built by Vite, dev server fixed on port
  1420 (Tauri expects this — see `vite.config.ts`/`tauri.conf.json`).
- **`src-tauri/`** — the desktop app shell (Rust). Compiles to the native
  binary; the frontend is embedded as `frontendDist` after `npm run build`.
- **`server/`** — optional self-hosted sync server (Axum), a *separate*
  Rust crate deployed independently via `server/docker-compose.yml`. Not
  built or bundled with the desktop app.

### Data flow / module boundaries

Frontend never talks to SQLite/sync/OCR/AI directly — everything crosses
the Tauri IPC boundary through `src/lib/tauri.ts`, which wraps
`@tauri-apps/api`'s `invoke()`. When adding a capability:

1. Add a `#[tauri::command]` fn in `src-tauri/src/commands/mod.rs`.
2. Register it in the `tauri::generate_handler![...]` list in
   `src-tauri/src/lib.rs`.
3. Add a typed wrapper in `src/lib/tauri.ts` — components call that, never
   `invoke()` directly.

`src-tauri/src/` module layout mirrors the pipeline in
`docs/architecture.md`: `db` (SQLite/FTS5) → `sync` (Automerge CRDT) →
`plugins` (Extism WASM) → `ocr` (Tesseract) → `ai` (Ollama) →
`commands` (the IPC surface). Each module is currently a stub with
`TODO(phase-N)` comments tying it to a project phase — check
`src-tauri/src/db/schema.rs` for the canonical data model before adding
storage code elsewhere.

Data hierarchy (drives both the SQLite schema and the frontend types):
`notebooks → sections → pages → blocks`. `Block` is a discriminated union
by `type` (`text | heading | image | checklist | table | code | divider |
canvas`) — see `src/types/index.ts` and
`src-tauri/src/db/schema.rs` for the two sides of this contract; keep
them in sync when block types change.

Frontend feature folders under `src/components/` (`editor/`, `canvas/`,
`sidebar/`, `search/`) are currently empty placeholders — one per planned
phase (rich editor, Excalidraw canvas, react-arborist tree, cmdk search).
State lives in `src/store/` (Zustand, one small store per concern, not a
single global store).

### Sync model

Sync is CRDT-based (Automerge), not client-server REST: each page is a
CRDT document that merges conflict-free on reconnect, either
peer-to-peer or via `server/`'s WebSocket API. `server/` persists sync
state/metadata to Postgres and attachments to MinIO/S3 — it is a relay
and durability layer, not the source of truth (the client's local SQLite
is).

## Project tracking

Work is tracked in Jira project **NTA** (Note Taking App), issues NTA-1
through NTA-6, one per phase in `docs/architecture.md`. When picking up
work, check which phase/issue it belongs to and keep the `TODO(phase-N)`
comment convention when adding new stub code.
