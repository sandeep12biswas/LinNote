// WCAG relative-luminance contrast, per Desing architecture §6.1: when the
// user picks a page background color, suggest the higher-contrast of
// black/white as the default font color (pre-selected but overridable in
// the font-color plugin's picker). Lives here, not inside
// plugins/format-font-color, because both the background picker
// (apps/desktop) and that plugin need it — a cross-cutting dependency the
// plugin model requires to be declared explicitly rather than assumed.

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) - 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, 1 (no contrast) - 21 (max). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Suggests the higher-contrast of black/white against `backgroundHex`.
 * A future revision may widen this to a small curated accessible palette
 * (Desing architecture §6.1 leaves that door open) — callers should treat
 * the result as a default, always overridable by the user.
 */
export function suggestTextColor(backgroundHex: string): "#000000" | "#ffffff" {
  const contrastWithBlack = contrastRatio(backgroundHex, "#000000");
  const contrastWithWhite = contrastRatio(backgroundHex, "#ffffff");
  return contrastWithBlack >= contrastWithWhite ? "#000000" : "#ffffff";
}
