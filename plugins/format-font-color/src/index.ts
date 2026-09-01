import type { Plugin, PluginContext } from "@linnote/plugin-sdk";
import { getActiveEditor } from "@linnote/rich-text-engine";

// Font Color — core.format.font-color
// Text color mark; uses @linnote/contrast-util (core.util.contrast) for its default suggestion — an explicit dependency, NOT a dependency on format-font-size (Desing architecture §6.1, §8.2).
//
// NTA-57: unlike Bold/Italic/Headers (NTA-42), this needs a *continuous*
// value from the user, not a toggle — and there's no popover/rich-UI
// system anywhere in this app yet. `openFontColorPicker` below opens the
// browser's own native color picker (a hidden `<input type="color">`,
// `.click()`ed programmatically) rather than building one, and applies
// the choice to whichever segment editor was last focused via
// `@linnote/rich-text-engine`'s tracker (NTA-42) — `TextStyle`/`Color`
// are already in `createBaseExtensions()`, so `setColor()` needs no new
// TipTap extension here.
//
// The ticket also wants the picker pre-filled with `contrast-util`'s
// suggested color for the open page's background — this plugin
// structurally can't know that (page/background is app state, not
// something a portable plugin reads), so `activate()` only registers a
// fixed-default fallback; `apps/desktop/src/canvas-core/FontColorHost.tsx`
// overwrites it with the real, page-aware version on the shared
// `CommandBus` once a page is open — the same pattern NTA-38 established
// (see registry/createContext.ts's own header comment on why the bus is
// bidirectionally shared, not solely plugin-owned).
export const APPLY_FONT_COLOR_COMMAND = "core.format.fontColor.apply";

/**
 * Opens a hidden native `<input type="color">` pre-filled with
 * `defaultColor`, applies every live change to the currently active
 * segment editor's text-color mark, and removes the input once the
 * picker closes. Exported so `FontColorHost.tsx` can reuse the exact
 * same picking/apply mechanics with a different (page-aware) default,
 * instead of duplicating the `<input>` trick.
 */
export function openFontColorPicker(defaultColor: string): void {
  const input = document.createElement("input");
  input.type = "color";
  input.value = defaultColor;
  input.style.position = "fixed";
  input.style.opacity = "0";
  input.style.pointerEvents = "none";
  document.body.appendChild(input);

  function cleanup() {
    input.remove();
  }

  // "input" fires live as the user adjusts the picker (a live preview on
  // the segment as they drag/type in the OS picker); "change"/"blur"
  // both signal it's done — cleanup on whichever fires first, the other
  // is then a no-op (`remove()` on an already-detached node is safe).
  input.addEventListener("input", () => {
    getActiveEditor()?.chain().focus().setColor(input.value).run();
  });
  input.addEventListener("change", cleanup, { once: true });
  input.addEventListener("blur", cleanup, { once: true });

  input.click();
}

/** Used only by the activate()-time fallback below — a page-open FontColorHost immediately overwrites this with the real, contrast-suggested default. */
const FALLBACK_DEFAULT_COLOR = "#000000";

export const plugin: Plugin = {
  manifest: {
    id: "core.format.font-color",
    name: "Font Color",
    version: "0.1.0",
    contributes: {
      menu: [{ menu: "Format", label: "Font Color…", commandId: APPLY_FONT_COLOR_COMMAND, priority: 15 }],
      formatCommands: [
      // TODO: register this plugin's command(s) against @linnote/rich-text-engine.
    ],
    },
  },
  activate(ctx: PluginContext) {
    ctx.commands.register(APPLY_FONT_COLOR_COMMAND, () => {
      openFontColorPicker(FALLBACK_DEFAULT_COLOR);
    });
  },
};

export default plugin;
