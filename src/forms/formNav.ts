import type { FormField } from '../document/types.ts';

/** Tab order helper for fill mode — kept out of FormOverlay for Fast Refresh. */
export function nextFormFieldId(
  fields: FormField[],
  currentId: string | null,
  direction: 1 | -1,
): string | null {
  const sorted = [...fields].sort(
    (a, b) =>
      a.pageIndex - b.pageIndex || a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  );
  if (sorted.length === 0) return null;
  if (!currentId) return sorted[0]?.id ?? null;
  const idx = sorted.findIndex((f) => f.id === currentId);
  if (idx < 0) return sorted[0]?.id ?? null;
  const next = (idx + direction + sorted.length) % sorted.length;
  return sorted[next]?.id ?? null;
}
