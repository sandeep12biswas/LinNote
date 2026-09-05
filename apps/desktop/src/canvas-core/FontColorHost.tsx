// The app-side glue for NTA-57: mirrors SegmentLayerHost.tsx's
// CommandBus-overwrite pattern (established by NTA-38) — installs a
// real, page-background-aware handler for `core.format.font-color`'s
// Format-menu command onto the shared `CommandBus` (../registry/
// createContext.ts, threaded down from ../App.tsx via
// ../shell/AppShell.tsx), overwriting the fixed-default fallback the
// plugin's own activate() registers. `plugins/format-font-color/src/
// index.ts` structurally can't know the open page's background color —
// only app-level code can.
//
// Renders nothing (`return null`) — it doesn't need to be inside
// CanvasViewport's pan/zoom-transformed layer the way SegmentLayerHost
// does, so it's mounted as a plain sibling in AppShell.tsx, not as
// CanvasViewport's `children`.

import { useEffect } from "react";
import { APPLY_FONT_COLOR_COMMAND, openFontColorPicker } from "@linnote/plugin-format-font-color";
import type { CommandBus } from "../registry";
import { useNotePageStore } from "./index";

/** Used only if the open page's own `suggestedTextColor` is somehow missing. */
const FALLBACK_COLOR = "#000000";

export interface FontColorHostProps {
  pageId: string;
  commandBus: CommandBus;
}

export function FontColorHost({ pageId, commandBus }: FontColorHostProps) {
  const suggestedColor = useNotePageStore((state) => state.pages[pageId]?.background.suggestedTextColor);

  useEffect(() => {
    commandBus.register(APPLY_FONT_COLOR_COMMAND, () => {
      openFontColorPicker(suggestedColor ?? FALLBACK_COLOR);
    });
    return () => commandBus.unregister(APPLY_FONT_COLOR_COMMAND);
  }, [commandBus, suggestedColor]);

  return null;
}
