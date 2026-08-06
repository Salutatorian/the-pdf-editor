import type { FormField, OverlayObject } from '../document/types.ts';

/**
 * After reorder: map old page index → new page index via the permutation
 * that produced the new document (`newOrder[newIndex] === oldIndex`).
 */
export function remapOverlaysAfterReorder(
  overlays: OverlayObject[],
  newOrder: number[],
): OverlayObject[] {
  const oldToNew = new Map<number, number>();
  for (let newIndex = 0; newIndex < newOrder.length; newIndex++) {
    oldToNew.set(newOrder[newIndex]!, newIndex);
  }
  return overlays.map((o) => {
    const next = oldToNew.get(o.pageIndex);
    if (next === undefined) return o;
    return { ...o, pageIndex: next };
  });
}

export function remapFieldsAfterReorder(
  fields: FormField[],
  newOrder: number[],
): FormField[] {
  const oldToNew = new Map<number, number>();
  for (let newIndex = 0; newIndex < newOrder.length; newIndex++) {
    oldToNew.set(newOrder[newIndex]!, newIndex);
  }
  return fields.map((f) => {
    const next = oldToNew.get(f.pageIndex);
    if (next === undefined) return f;
    return { ...f, pageIndex: next };
  });
}

/**
 * After delete: pages after a removed index shift down.
 * Overlays/fields on deleted pages are dropped.
 */
export function remapOverlaysAfterDelete(
  overlays: OverlayObject[],
  deletedIndexes: number[],
): OverlayObject[] {
  const deleted = new Set(deletedIndexes);
  return overlays
    .filter((o) => !deleted.has(o.pageIndex))
    .map((o) => {
      const shift = [...deleted].filter((d) => d < o.pageIndex).length;
      return { ...o, pageIndex: o.pageIndex - shift };
    });
}

export function remapFieldsAfterDelete(
  fields: FormField[],
  deletedIndexes: number[],
): FormField[] {
  const deleted = new Set(deletedIndexes);
  return fields
    .filter((f) => !deleted.has(f.pageIndex))
    .map((f) => {
      const shift = [...deleted].filter((d) => d < f.pageIndex).length;
      return { ...f, pageIndex: f.pageIndex - shift };
    });
}

/**
 * After duplicate of `pageIndex`: pages after it shift +1;
 * overlays on the duplicated page are copied onto the new page.
 */
export function remapOverlaysAfterDuplicate(
  overlays: OverlayObject[],
  pageIndex: number,
): OverlayObject[] {
  const result: OverlayObject[] = [];
  for (const o of overlays) {
    if (o.pageIndex < pageIndex) {
      result.push(o);
    } else if (o.pageIndex === pageIndex) {
      result.push(o);
      result.push({
        ...o,
        id: `${o.id}-dup`,
        pageIndex: pageIndex + 1,
      });
    } else {
      result.push({ ...o, pageIndex: o.pageIndex + 1 });
    }
  }
  return result;
}

/** Build a new page order by moving selected pages up by one slot. */
export function moveSelectedUp(
  pageCount: number,
  selected: number[],
): number[] | null {
  const order = Array.from({ length: pageCount }, (_, i) => i);
  const sel = [...new Set(selected)].sort((a, b) => a - b);
  if (sel.length === 0 || sel[0] === 0) return null;
  for (const i of sel) {
    const pos = order.indexOf(i);
    if (pos <= 0) continue;
    const prev = order[pos - 1]!;
    if (sel.includes(prev)) continue;
    order[pos - 1] = i;
    order[pos] = prev;
  }
  return order;
}

/** Build a new page order by moving selected pages down by one slot. */
export function moveSelectedDown(
  pageCount: number,
  selected: number[],
): number[] | null {
  const order = Array.from({ length: pageCount }, (_, i) => i);
  const sel = [...new Set(selected)].sort((a, b) => b - a);
  if (sel.length === 0 || sel[0] === pageCount - 1) return null;
  for (const i of sel) {
    const pos = order.indexOf(i);
    if (pos < 0 || pos >= order.length - 1) continue;
    const next = order[pos + 1]!;
    if (sel.includes(next)) continue;
    order[pos + 1] = i;
    order[pos] = next;
  }
  return order;
}
