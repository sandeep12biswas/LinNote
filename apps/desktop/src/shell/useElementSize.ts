// NTA-56 — a small `ResizeObserver`-backed hook so FolderTreePane.tsx and
// PageListPane.tsx can size their `react-window` `FixedSizeList` to
// whatever height the flex layout (App.css's `.app-shell__pane`) actually
// gives them, rather than a hardcoded pixel height. No AutoSizer package
// (`react-virtualized-auto-sizer`) is an `apps/desktop` dependency —
// docs/architecture.md's tool inventory lists only `react-window` for
// this — so this is a deliberately minimal stand-in rather than pulling
// in a second virtualization-adjacent package for one hook's worth of
// code.

import { useEffect, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Returns a ref to attach to the element you want measured, and its
 * current content-box size (`{ width: 0, height: 0 }` until the first
 * `ResizeObserver` callback fires, i.e. for one render right after mount).
 */
export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, ElementSize] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
