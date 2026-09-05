---
name: run-desktop
description: Build, run, and drive LinNote's desktop app (apps/desktop, Tauri v2 + React). Use when asked to start/run the app, take a screenshot of its UI, click through the workspace tree or a page's canvas, or otherwise interact with the running frontend. Also covers the Vite build and vitest test suite for this package.
---

LinNote's desktop app is driven via headless Chromium (Playwright)
against the plain Vite dev server, **not** the native Tauri window —
this container has no Xvfb and no root to install it (`sudo` needs a
terminal to authenticate here), so `pnpm tauri dev`'s real
GTK/webkit2gtk window can never be launched or screenshotted. The
driver at `.claude/skills/run-desktop/driver.mjs` boots headless
Chromium with a minimal mock of Tauri's JS↔native IPC bridge injected,
so the real React app renders and its plugin registry, canvas, and
formatting logic all run for real — everything this covers is genuine;
only OS-native surfaces (real file-picker dialog, real "open with",
Tauri's own permission/capability enforcement) are outside its reach.

All paths below are relative to `apps/desktop/` (this package), not
repo root.

## Prerequisites

No system packages needed beyond what this sandbox already has —
`node`/`pnpm` for the app itself, and Playwright's own Chromium binary
(fetched below, not from apt). No root was available (`sudo` fails
with "a terminal is required to authenticate"), so this was verified
*without* Xvfb — headless Chromium's `--no-sandbox` launch worked with
zero extra `.so` packages, confirmed by actually launching it.

```bash
node -v && pnpm -v   # this repo needs pnpm — see repo-root CLAUDE.md
```

## Setup

Two independent installs — the repo's own deps (needed for Vite to
serve `apps/desktop` at all), and this skill's own driver deps (kept
**out** of the pnpm workspace on purpose — `.claude/skills/run-desktop/`
isn't matched by repo-root `pnpm-workspace.yaml`'s globs, so a plain
`npm install` here never touches the workspace's pnpm-managed
`node_modules`):

```bash
cd ../..   # repo root
pnpm install

cd apps/desktop/.claude/skills/run-desktop
npm install                        # playwright, pinned in this dir's own package.json
npx playwright install chromium    # no-op if already cached at ~/.cache/ms-playwright
```

## Run (agent path)

1. Start the Vite dev server (from `apps/desktop/`), and wait for it to
   actually serve — don't `sleep`, poll the port:

   ```bash
   cd apps/desktop
   lsof -ti:1420 -sTCP:LISTEN 2>/dev/null | xargs -r kill   # free the port from a previous run
   pnpm dev > /tmp/linnote-vite-dev.log 2>&1 &
   disown
   timeout 30 bash -c 'until curl -sf http://localhost:1420 >/dev/null; do sleep 1; done'
   ```

2. Drive it: pipe a script into the REPL driver's stdin. **No tmux
   needed** (this sandbox doesn't have it, and doesn't need it) — the
   driver queues and awaits each line in order, so a plain heredoc
   works:

   ```bash
   node .claude/skills/run-desktop/driver.mjs <<'EOF'
   launch
   click-text ▸
   click-text Work
   click-text Meeting Notes
   mouse-click 900 400
   type Hello LinNote!
   press Control+a
   click-text Format
   click-text Bold
   ss meeting-notes-bold
   html .segment-layer
   quit
   EOF
   ```

   This exact script was run to write this skill — output ended with
   a `.segment-block` containing `<p><strong>Hello LinNote!</strong></p>`
   and a screenshot showing the bold, selected text in a real segment
   on the "Meeting Notes" page.

3. Stop the dev server when done:

   ```bash
   lsof -ti:1420 -sTCP:LISTEN 2>/dev/null | xargs -r kill
   ```

Screenshots land in `/tmp/linnote-shots/` (override with
`SCREENSHOT_DIR`). Point the driver at a different dev server with
`LINNOTE_DEV_URL` (default `http://localhost:1420`).

### Driver commands

| command | what it does |
|---|---|
| `launch` | opens headless Chromium, mocks the Tauri IPC bridge, navigates to the dev server |
| `ss [name]` | full-page screenshot to `SCREENSHOT_DIR` |
| `click-text <text>` | finds an element by text (interactive elements first, see Gotchas) and calls `.click()` on it directly |
| `click <selector>` | Playwright `locator.click()`, falls back to a DOM `.click()` on failure |
| `dblclick <selector>` | dispatches a real `dblclick` `MouseEvent` on the DOM node |
| `mouse-click <x> <y>` | raw viewport-coordinate click — needed for the segment create-on-type gesture (see Gotchas) |
| `mouse-click-center <selector>` | clicks the center of a selector's bounding box — unreliable for `.canvas-viewport__transform` itself, see Gotchas |
| `type <text>` | keyboard.type |
| `press <key>` | keyboard.press (e.g. `Control+a`) |
| `fill <selector> <text>` | Playwright `.fill()` — goes through React's controlled-input pipeline, unlike a raw DOM value set |
| `wait <selector>` | waits up to 10s for a selector to appear |
| `text <selector>` / `html <selector>` | dumps textContent / innerHTML |
| `invoke-log` | dumps every mocked Tauri IPC call made so far — use this to see what a new flow actually calls |
| `quit` | closes the browser, exits |

### Example: file attachment + YouTube embed (NTA-45)

```bash
node .claude/skills/run-desktop/driver.mjs <<'EOF'
launch
click-text ▸
click-text Work
click-text Meeting Notes
click-text Insert File
ss file-attachment
html .file-attachment-layer
click-text Insert YouTube
fill #youtube-embed-dialog__url https://www.youtube.com/watch?v=dQw4w9WgXcQ
click-text Play here
ss youtube-inline
html .youtube-embed-layer
quit
EOF
```

Runs clean: a `.file-attachment-block` with `report.docx`/`example.docx`
renders and is draggable; the YouTube dialog opens, and "Play here"
produces a real `<iframe src="https://www.youtube-nocookie.com/embed/...">`.
Override the mocked file path with `LINNOTE_MOCK_FILE_PATH=/some/path`.

## Run (human path)

`pnpm tauri dev` opens the real native window — untested here (no
Xvfb, no root to add it). `pnpm dev` alone (no driver) just serves the
bare page; without the IPC mock above it hangs forever on "Loading
plugins…" (see Gotchas).

## Test

```bash
cd apps/desktop
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run --passWithNoTests
pnpm build            # tsc -b && vite build
```

225 tests pass as of this writing (20 test files). `pnpm typecheck`
and `pnpm lint:boundaries` (repo root) are workspace-wide — run those
from repo root, not here, if you touched `plugins/*`.

## Gotchas

- **Zero-delay synthetic typing can silently drop the first few
  characters of a segment's text — a pre-existing race, not specific to
  any one feature.** Confirmed present on unmodified `main`/`develop`
  too (not something a later change introduced): typing a string with
  `page.keyboard.type(text)` (no delay) into a fresh segment,
  immediately followed by Ctrl+A + a Format-menu command, sometimes
  drops a leading substring (`"Hello Undo Test"` -> `"lo Undo Test"`)
  — flaky, varies run to run, same script. `type` in this driver
  already uses `{ delay: 20 }` for exactly this reason; don't remove it
  chasing "faster" test scripts, and don't assume a truncated string
  means a bug in whatever you're actually testing — rerun once before
  concluding that.
- **The app hangs forever on "Loading plugins…" without the IPC mock.**
  Every `core.*` plugin's `activate()` reads/writes plugin-settings via
  `@tauri-apps/plugin-fs`, which calls
  `window.__TAURI_INTERNALS__.invoke(...)` — undefined in a plain
  browser, throwing `Cannot read properties of undefined (reading
  'invoke')` before the registry ever finishes activating. `launch`
  injects a mock of that bridge via `page.addInitScript` *before*
  `goto()`, so it's in place before the app's own JS runs.
- **A wrapping `<div>`/`<span>` around a real button also matches that
  button's text, and clicking the wrapper does nothing.** An element's
  own `.click()` only dispatches on itself and bubbles *up* — it never
  reaches a *descendant* button's own `onClick`. `click-text` searches
  interactive elements (`button`, `[role=button]`, `.page-list__item`,
  ...) first and only falls back to generic `span`/`div`/`p` if nothing
  interactive matches — searching in the opposite order silently clicks
  the wrong node (confirmed: it matched `.page-list__viewport` instead
  of the actual page-list button, and the page never opened).
- **The Folder Tree / Page List panes are `react-window`-virtualized,
  and Playwright's normal `locator.click()` can hang for the full
  30s timeout** with `<div class="page-list__viewport"> intercepts
  pointer events` even though the row is visibly painted in a
  screenshot taken at the same moment — the virtualized scroll
  container reports a momentarily-wrong hit-testable box. `click-text`
  (a direct DOM `.click()`) sidesteps this; a plain `click <selector>`
  falls back to the same thing on failure.
- **`.canvas-viewport__transform` (the pan/zoom layer that segments,
  file attachments, and YouTube embeds all mount inside) is
  content-sized — 0×0 until at least one element already exists on the
  page.** `mouse-click-center .canvas-viewport__transform` therefore
  lands at the pane's top-left corner, not open canvas body, and typing
  afterward creates no segment. Use `mouse-click <x> <y>` at a raw
  coordinate confirmed visually inside the Editor Canvas pane instead
  (e.g. `900 400` at the default 1400×900 viewport this driver uses).
- **A piped heredoc fires every REPL line's `readline` `'line'` event
  immediately — before an earlier line's async command has finished.**
  Without the driver's internal command queue, `launch` and every
  command after it race and fail with `ERROR: launch first`. Already
  fixed in the committed driver; worth knowing if you extend it.
- **A real bug in the app itself was found this way, not by
  guessing:** the YouTube insert dialog (`position: fixed`) was
  originally trapped inside `.canvas-viewport__transform` — a CSS
  `transform` on an ancestor makes it the containing block for a
  `fixed` descendant, so the dialog's backdrop collapsed to 0×0 and the
  page header intercepted every click meant for it. Fixed via
  `createPortal` to `document.body` (see
  `plugins/element-youtube-embed/src/YouTubeEmbedLayer.tsx`). If a
  future modal added anywhere in `canvas-core`/`plugins/element-*`
  shows the same "renders but nothing is clickable" symptom, check this
  first.

## Troubleshooting

- **`curl: (7) Failed to connect` polling `localhost:1420`**: the dev
  server didn't start or crashed — check `/tmp/linnote-vite-dev.log`.
  A stale process on the port from a previous run is the most common
  cause; the `lsof -ti:1420 ... | xargs -r kill` step above handles it.
- **`Error: Cannot find module 'playwright'`**: you're running
  `driver.mjs` without having `npm install`ed in *this* directory
  (`apps/desktop/.claude/skills/run-desktop/`) — it's deliberately
  outside the pnpm workspace, so the repo-root `pnpm install` doesn't
  cover it.
- **`npx playwright install chromium` looks like it's doing nothing**:
  it already is — the browser is cached at `~/.cache/ms-playwright` and
  reused across runs/projects; check that dir before assuming it needs
  a fresh multi-hundred-MB download.
