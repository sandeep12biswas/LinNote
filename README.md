# LinNote

A cross-platform OneNote alternative built with Tauri v2 + React + TypeScript,
targeting Linux (primary) and Windows. Offline-first, self-hostable sync,
local AI support via Ollama.

See [`docs/architecture.md`](docs/architecture.md) for the full plan
(tech stack, project structure, phases, dev setup).

## Quick start

```bash
pnpm install
pnpm tauri dev
```

Requires Rust and the Tauri Linux prerequisites — see
[`docs/architecture.md`](docs/architecture.md#dev-setup-kubuntu).
