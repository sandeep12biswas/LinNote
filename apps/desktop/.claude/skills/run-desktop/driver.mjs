#!/usr/bin/env node
// REPL driver for LinNote's desktop app (apps/desktop) — a Tauri v2 +
// React frontend. Drives it via headless Chromium (Playwright) against
// the plain Vite dev server, NOT the native Tauri window: this
// container has no Xvfb and no root to install it (`sudo` needs a
// terminal to authenticate here), so `pnpm tauri dev`'s real GTK/
// webkit2gtk window can't be launched or screenshotted. See this
// skill's SKILL.md "Gotchas" for why the browser-plus-mock path below
// is the right handle instead, and what it does and doesn't cover.
//
// Run inside tmux; send-keys one command per line, capture-pane the
// output. `launch` first, then any of the commands below, `quit` last.

import { chromium } from "playwright";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";

const SHOT_DIR = process.env.SCREENSHOT_DIR || "/tmp/linnote-shots";
fs.mkdirSync(SHOT_DIR, { recursive: true });
const DEV_URL = process.env.LINNOTE_DEV_URL || "http://localhost:1420";

let browser = null;
let page = null;

// Minimal mock of window.__TAURI_INTERNALS__ (the global @tauri-apps/api
// reads `invoke`/`transformCallback`/etc. off of) — enough for the app's
// startup path (plugin-settings read/write via @tauri-apps/plugin-fs in
// every core.* plugin's activate(), plus the file-attachment/youtube-
// embed plugins' plugin-dialog/plugin-shell calls) to resolve instead of
// throwing "Cannot read properties of undefined (reading 'invoke')" and
// getting stuck on the "Loading plugins…" splash forever.
//
// Extend the switch below if a future change calls a new Tauri command
// on a path this driver's flows reach — anything unhandled falls through
// to `null`, which is usually harmless (log it via `invoke-log` when in
// doubt).
const MOCK_INIT_SCRIPT = `
(() => {
  window.__mockInvokeLog = [];
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      window.__mockInvokeLog.push({ cmd, args });
      switch (cmd) {
        case 'plugin:fs|exists': return false;
        case 'plugin:fs|mkdir': return null;
        case 'plugin:fs|write_text_file': return null;
        case 'plugin:fs|rename': return null;
        case 'plugin:fs|read_text_file': throw new Error('ENOENT (mock)');
        // Real path (used by "Insert File Attachment", NTA-62) — override
        // via LINNOTE_MOCK_FILE_PATH if a flow needs a different one.
        case 'plugin:dialog|open': return ${JSON.stringify(process.env.LINNOTE_MOCK_FILE_PATH || "/tmp/example.docx")};
        case 'plugin:shell|open': return null;
        default: return null;
      }
    },
    transformCallback: () => Math.floor(Math.random() * 1e9),
    unregisterCallback: () => {},
    convertFileSrc: (p) => p,
  };
})();
`;

function shotPath(name) {
  return path.join(SHOT_DIR, `${name || "ss-" + Date.now()}.png`);
}

const COMMANDS = {
  async launch() {
    if (browser) return console.log("already launched");
    browser = await chromium.launch({ args: ["--no-sandbox"] });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log("[console.error]", msg.text());
    });
    page.on("pageerror", (err) => console.log("[pageerror]", err.message));
    await page.addInitScript(MOCK_INIT_SCRIPT);
    await page.goto(DEV_URL, { waitUntil: "load" });
    await page.waitForTimeout(1000);
    console.log("launched.", DEV_URL, "- title:", await page.title());
  },

  async ss(name) {
    if (!page) return console.log("ERROR: launch first");
    const f = shotPath(name);
    await page.screenshot({ path: f, fullPage: true });
    console.log("screenshot:", f);
  },

  // Clicks a DOM element by exact/partial text content, via el.click()
  // rather than Playwright's own hit-testing. Needed for react-window-
  // virtualized rows (Folder Tree / Page List): their scroll container
  // reports a 0x0 bounding box for a render tick right after mount, which
  // makes Playwright's normal locator.click() pick the wrong pixel even
  // once the row is visibly painted (see SKILL.md's Gotchas).
  async "click-text"(text) {
    if (!page) return console.log("ERROR: launch first");
    const r = await page.evaluate((t) => {
      // Interactive elements FIRST, and only among those — a wrapping
      // <div>/<span> around the real button also matches the button's
      // text (textContent includes descendants), and calling .click() on
      // that wrapper does NOT fire the descendant button's own onClick
      // (an element's own .click() only dispatches on itself, then
      // bubbles up, never down) — so a naive "any element whose text
      // matches" search silently clicks the wrong node and nothing
      // happens. Only fall back to a bare span/div if truly nothing
      // interactive matches (e.g. the page header title text).
      const interactive = [...document.querySelectorAll("button, [role='button'], a, input, .page-list__item")];
      const generic = [...document.querySelectorAll("span, div, p, h1, h2, h3")];
      const pool = [interactive, generic];
      for (const els of pool) {
        const el = els.find((e) => e.textContent?.trim() === t) ?? els.find((e) => e.textContent?.includes(t));
        if (el) {
          el.click();
          return "OK: " + el.tagName + "." + el.className;
        }
      }
      return "NOT_FOUND";
    }, text);
    console.log("click-text", JSON.stringify(text), "->", r);
  },

  // CSS-selector click. Falls back to a DOM el.click() on failure (same
  // reasoning as click-text above).
  async click(sel) {
    if (!page) return console.log("ERROR: launch first");
    try {
      await page.click(sel);
      console.log("clicked", sel);
    } catch (e) {
      console.log("locator click failed (", e.message.split("\n")[0], ") - falling back to DOM click");
      const r = await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return "NOT_FOUND";
        el.click();
        return "OK";
      }, sel);
      console.log("dom-click", sel, "->", r);
    }
  },

  async dblclick(sel) {
    if (!page) return console.log("ERROR: launch first");
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return "NOT_FOUND";
      el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      return "OK";
    }, sel);
    console.log("dblclick", sel, "->", r);
  },

  async type(text) {
    if (!page) return console.log("ERROR: launch first");
    // A small per-character delay, not zero — see SKILL.md's Gotchas:
    // zero-delay synthetic typing can outrun TipTap/ProseMirror's own
    // keystroke handling and silently drop the first few characters
    // (a pre-existing app race, confirmed present on unmodified code
    // too — not specific to any one feature).
    await page.keyboard.type(text, { delay: 20 });
    console.log("typed:", JSON.stringify(text));
  },

  async press(key) {
    if (!page) return console.log("ERROR: launch first");
    await page.keyboard.press(key);
    console.log("pressed:", key);
  },

  // `fill <selector> <text...>` — for a real controlled <input>, Playwright's
  // fill() (not a raw DOM .value= set) so React's onChange actually fires.
  async fill(args) {
    if (!page) return console.log("ERROR: launch first");
    const sp = args.indexOf(" ");
    const [sel, text] = sp === -1 ? [args, ""] : [args.slice(0, sp), args.slice(sp + 1)];
    await page.fill(sel, text);
    console.log("filled", sel, "with", JSON.stringify(text));
  },

  async wait(sel) {
    if (!page) return console.log("ERROR: launch first");
    try {
      await page.waitForSelector(sel, { timeout: 10_000 });
      console.log("found:", sel);
    } catch {
      console.log("TIMEOUT waiting for", sel);
    }
  },

  async text(sel) {
    if (!page) return console.log("ERROR: launch first");
    console.log(await page.locator(sel).textContent().catch(() => "NOT_FOUND"));
  },

  async html(sel) {
    if (!page) return console.log("ERROR: launch first");
    console.log(await page.locator(sel).innerHTML().catch(() => "NOT_FOUND"));
  },

  // `mouse-click <x> <y>` — raw viewport coordinates. Needed for the
  // segment "invisible create-on-type" gesture: it fires on a plain
  // mousemove/click over open canvas body, not any particular selector,
  // and `.canvas-viewport__transform` (the pan/zoom layer) is itself
  // content-sized — 0×0 until at least one element already exists on the
  // page — so centering on *that* selector's bounding box (see
  // mouse-click-center below) lands right at the pane's top-left corner,
  // not open canvas space. Pick a coordinate visibly inside the Editor
  // Canvas pane from a screenshot first.
  async "mouse-click"(args) {
    if (!page) return console.log("ERROR: launch first");
    const [x, y] = args.split(" ").map(Number);
    await page.mouse.click(x, y);
    console.log("mouse-clicked", x, y);
  },

  // `mouse-drag <x1> <y1> <x2> <y2>` — a real pointer down/move/up
  // sequence at raw viewport coordinates, for exercising a drag gesture
  // (segment move/resize, file-attachment/youtube-embed move) the same
  // way a user's mouse would, not a synthetic single click.
  async "mouse-drag"(args) {
    if (!page) return console.log("ERROR: launch first");
    const [x1, y1, x2, y2] = args.split(" ").map(Number);
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 5 });
    await page.mouse.up();
    console.log("mouse-dragged", { x1, y1, x2, y2 });
  },

  // Raw mouse click at the center of a selector's bounding box — useful
  // when you need the *real* pointer coordinates (e.g. testing a drag
  // gesture's own pointermove math, not just "does the click handler run").
  // NOT reliable for clicking "into" .canvas-viewport__transform itself —
  // see `mouse-click`'s own comment above.
  async "mouse-click-center"(sel) {
    if (!page) return console.log("ERROR: launch first");
    const box = await page.locator(sel).boundingBox();
    if (!box) return console.log("NOT_FOUND:", sel);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    console.log("mouse-clicked center of", sel, box);
  },

  // Evaluates `code` (a JS expression) INSIDE the page — passed as a
  // string so Playwright serializes it into the page's own context,
  // never the driver's Node context (which has no `window`/`document`).
  async eval(code) {
    if (!page) return console.log("ERROR: launch first");
    try {
      const result = await page.evaluate(`(() => (${code}))()`);
      console.log(JSON.stringify(result));
    } catch (e) {
      console.log("ERROR:", e.message);
    }
  },

  async "invoke-log"() {
    if (!page) return console.log("ERROR: launch first");
    console.log(JSON.stringify(await page.evaluate(() => window.__mockInvokeLog), null, 2));
  },

  async quit() {
    if (browser) await browser.close();
    console.log("bye");
    process.exit(0);
  },
};

console.log("LinNote desktop driver ready. Commands:", Object.keys(COMMANDS).join(", "));

// A piped heredoc (`node driver.mjs <<'EOF' ... EOF`, the agent path this
// skill documents) delivers every line's 'line' event back-to-back,
// synchronously, well before an earlier line's async command finishes —
// readline itself does not wait for the handler's promise. Queue lines
// and run them strictly one at a time, or `launch` (and everything after
// it) races and fails with "ERROR: launch first".
let queue = Promise.resolve();
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  queue = queue.then(async () => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const sp = trimmed.indexOf(" ");
    const cmd = sp === -1 ? trimmed : trimmed.slice(0, sp);
    const arg = sp === -1 ? "" : trimmed.slice(sp + 1);
    const fn = COMMANDS[cmd];
    if (!fn) {
      console.log("unknown command:", cmd, "- known:", Object.keys(COMMANDS).join(", "));
      return;
    }
    try {
      await fn(arg);
    } catch (e) {
      console.log("ERROR:", e.message);
    }
  });
});
