/**
 * Shared fill typography — editor CSS and saved PDF ink must use the same
 * base point size so browser viewers match what you typed on screen.
 *
 * Never size to the full cell height (AcroForm default ≈ height−padding →
 * giant "Saipan" / school names in Chrome).
 */
export function formFieldTextSize(rect: {
  width: number;
  height: number;
}): number {
  if (rect.height >= 28) return 10;
  return Math.min(10, Math.max(7, rect.height * 0.5));
}

/** On-screen px size at the current zoom (PDF points × scale). */
export function formFieldCssFontSize(
  rect: { width: number; height: number },
  scale: number,
): number {
  return formFieldTextSize(rect) * Math.max(0.01, scale);
}
