# LinNote

A cross-platform OneNote alternative built with Tauri v2 + React +
TypeScript, targeting Linux (primary) and Windows. Rebuilt around a
**plugin-first architecture**: every formatting command, canvas element
type, and cloud-sync provider is its own independently
addable/removable/upgradable package — see
[`docs/architecture.md`](docs/architecture.md) for the full design.

## Repo shape

A pnpm + Turborepo workspace, one package per plugin:

```
apps/desktop/   the Tauri v2 app (shell, plugin registry, canvas core, persistence)
packages/       shared, non-plugin code (plugin-sdk, plugin-playground, contrast-util, rich-text-engine)
plugins/        one package per feature (formatting commands, canvas element types, sync providers)
```

## Prerequisites

- **Node.js 20+**
- **pnpm 9+** (required — this is a pnpm workspace, not npm)
- **Rust** (`rustc`/`cargo`) for the Tauri desktop shell
- Tauri v2 Linux system libraries: `libwebkit2gtk-4.1-dev`,
  `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Tauri Linux prerequisites
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# pnpm, via Node's bundled Corepack
corepack enable
corepack prepare pnpm@9 --activate
```

See [`docs/architecture.md`](docs/architecture.md#tools--software-required)
for the full tool inventory and an alternate install path if Corepack
can't write into a root-owned directory.

## Quick start

```bash
pnpm install
pnpm tauri dev
```

## Everyday commands

```bash
pnpm dev                                             # vite dev server for the desktop app only
pnpm tauri dev                                       # full app: Tauri window + vite dev server
pnpm --filter @linnote/plugin-format-bold dev        # develop one plugin in isolation
pnpm build                                           # build every package that needs it
pnpm typecheck                                       # TypeScript across the whole workspace
pnpm lint:boundaries                                 # enforce plugin import isolation
pnpm test                                            # run every package's tests
pnpm create-plugin <kebab-case-name>                 # scaffold a new plugins/* package
```

See [`docs/architecture.md`](docs/architecture.md) for the full plan:
plugin architecture and extension points, workspace/page/segment data
model, persistence and cloud-sync design, repository/tooling strategy,
and the phased implementation plan.
