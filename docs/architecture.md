# LinNote — Architecture & Plan

> Source of truth: Notion — "📝 Linux Note-Taking App — Architecture & Plan"
> (Note App project → Planning section). Mirrored here so it travels with
> the code; update both when the plan changes.

A cross-platform OneNote alternative built with **Tauri v2 + React +
TypeScript**, targeting Linux (primary) and Windows. Offline-first,
self-hostable sync, local AI support via Ollama.

## Tech stack

**Frontend** — React 19 + TypeScript, BlockNote/TipTap (rich text),
Excalidraw (canvas/ink), Zustand (state), Tailwind CSS v4 (styling),
react-arborist (sidebar tree), cmdk (search palette).

**App shell** — Tauri v2 (Rust): native window, tray, global hotkeys,
file watcher, notifications, auto-updater, deep links. WebKitGTK on
Linux, WebView2 on Windows.

**Local storage** — `sqlx` + SQLite with FTS5 full-text search.
Attachments under the XDG data dir on Linux / `%APPDATA%` on Windows.
AES-256-GCM encryption at rest via `ring`. Schema: notebooks → sections
→ pages → blocks.

**Sync engine** — Automerge-rs (CRDT), peer-to-peer or via the optional
self-hosted server.

**Plugin system** — Extism (WASM sandbox); built-in OCR (Tesseract) and
local AI (Ollama).

**Optional cloud sync server** (`server/`) — Axum (HTTP + WebSocket),
PostgreSQL (metadata/sync state), MinIO/S3 (attachments), Docker Compose.

## Project structure

```
LinNote/
├── src/                    # React frontend
│   ├── components/
│   │   ├── editor/         # BlockNote/TipTap blocks        (phase 2)
│   │   ├── canvas/         # Excalidraw block                (phase 3)
│   │   ├── sidebar/        # react-arborist notebook tree    (phase 1)
│   │   └── search/         # cmdk command palette            (phase 4)
│   ├── store/               # zustand stores
│   ├── lib/tauri.ts         # typed invoke() wrappers
│   └── types/                # shared domain types
├── src-tauri/               # Tauri app shell (Rust)
│   └── src/
│       ├── db/              # SQLite + FTS5, schema           (phase 1/4)
│       ├── sync/            # Automerge CRDT engine           (phase 5)
│       ├── plugins/         # Extism WASM plugin sandbox
│       ├── ocr/             # Tesseract OCR                   (phase 3)
│       ├── ai/              # Ollama local AI
│       └── commands/        # invoke() surface
└── server/                  # optional self-hosted sync server (phase 5)
    ├── src/main.rs           # Axum HTTP + WebSocket
    └── docker-compose.yml    # server + Postgres + MinIO
```

## Phases

1. **Skeleton** (weeks 1–3) — bootstrap, sidebar tree ↔ SQLite, page CRUD.
2. **Rich editor** (weeks 4–6) — BlockNote blocks, Markdown import/export.
3. **Canvas + attachments** (weeks 7–9) — Excalidraw block, file dialogs, OCR.
4. **Search + tags** (week 10) — FTS5, cmdk palette, tag system.
5. **Sync engine** (weeks 11–14) — automerge-rs, Axum server, conflict UI.
6. **Polish + packaging** (weeks 15–16) — CI for `.deb`/`.rpm`/AppImage/
   Flatpak/NSIS/MSI, auto-update, dark mode, shortcuts, accessibility.

Tracked in Jira project **NTA** (Note Taking App): NTA-1 … NTA-6, one per
phase above.

## Dev setup (Kubuntu)

```bash
# Tauri prerequisites
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node + pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh

# Install deps and run
pnpm install
pnpm tauri dev
```
