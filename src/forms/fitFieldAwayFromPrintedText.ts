import type { FormField, FormFieldRect } from '../document/types.ts';
import type { DrawnBox } from './detectDrawnBoxes.ts';

/** Printed page text in the same top-left coords as form field rects (scale=1). */
export type PrintedTextBox = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function isIgnorablePrintedText(str: string): boolean {
  const t = str.trim();
  if (!t) return true;
  if (/^[_\.\-–—=\s]+$/.test(t)) return true;
  if (/^[\[\]\(\)\|\/\\]+$/.test(t)) return true;
  return false;
}

function overlaps(a: FormFieldRect, b: FormFieldRect, pad = 0.5): boolean {
  return !(
    a.x + a.width < b.x - pad ||
    b.x + b.width < a.x - pad ||
    a.y + a.height < b.y - pad ||
    b.y + b.height < a.y - pad
  );
}

function containsPoint(r: FormFieldRect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

function area(r: FormFieldRect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

function glyphHeight(t: PrintedTextBox): number {
  return Math.min(Math.max(t.height, 7), 14);
}

/**
 * If a form widget sits inside a larger ruled cell, expand to that cell so we
 * can fill the whole empty interior (AcroForm widgets are often undersized).
 */
export function expandRectToContainingDrawnBox(
  rect: FormFieldRect,
  drawnBoxes: DrawnBox[],
): FormFieldRect {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  let best: DrawnBox | null = null;
  for (const box of drawnBoxes) {
    if (box.kind !== 'text') continue;
    if (box.width < 40 || box.height < 14) continue;
    // Widget center inside the ruled cell, and cell is meaningfully larger
    if (!containsPoint(box, cx, cy)) continue;
    if (area(box) < area(rect) * 1.15) continue;
    if (!best || area(box) < area(best)) best = box;
  }
  if (!best) return rect;
  return {
    x: best.x,
    y: best.y,
    width: best.width,
    height: best.height,
  };
}

/**
 * Given a closed cell + printed text inside it, return the type-in rect that
 * fills remaining empty space without covering labels/titles.
 */
export function fitFillRectInClosedBox(
  cell: FormFieldRect,
  printed: PrintedTextBox[],
): FormFieldRect {
  const edge = 2;
  const cellRight = cell.x + cell.width;
  const cellBottom = cell.y + cell.height;

  const hits = printed.filter((t) => {
    if (isIgnorablePrintedText(t.str)) return false;
    if (t.width < 2) return false;
    return overlaps(t, cell);
  });

  if (hits.length === 0) {
    return {
      x: cell.x + edge,
      y: cell.y + edge,
      width: Math.max(20, cell.width - edge * 2),
      height: Math.max(12, cell.height - edge * 2),
    };
  }

  // --- Detect left-side label (same row) vs top title ---
  const leftBand = cell.x + Math.min(cell.width * 0.5, 220);
  const leftLabels = hits.filter((t) => {
    const tRight = t.x + t.width;
    const nearLeft = t.x <= cell.x + 10;
    const notFullWidth = tRight <= leftBand;
    return nearLeft && notFullWidth;
  });

  // Top band: first ~40% of cell or 28pt — catches multi-line headers
  const titleBandLimit =
    cell.y + Math.min(28, Math.max(14, cell.height * 0.4));
  const topTitles = hits.filter((t) => {
    const gh = glyphHeight(t);
    return t.y <= titleBandLimit && t.y + gh >= cell.y - 1;
  });

  // Short sublabels under a title (FROM / TO) — never treat as the only layout cue
  const isSublabel = (t: PrintedTextBox) =>
    /^(from|to|yes|no|mm|yyyy|month|year)$/i.test(t.str.trim());

  const hasWideTopTitle = topTitles.some((t) => {
    if (isSublabel(t)) return false;
    // Short-row left labels (Description of Work) are not top headers
    const tRight = t.x + t.width;
    const looksLeftLabel =
      t.x <= cell.x + 10 &&
      tRight <= cell.x + Math.min(cell.width * 0.5, 220);
    if (looksLeftLabel && cell.height <= 48) return false;
    return (
      t.width >= cell.width * 0.28 ||
      t.str.trim().length >= 18 ||
      /employment|address|employer|education|training|dates of/i.test(t.str)
    );
  });

  const leftLabelWidth =
    leftLabels.length > 0
      ? Math.max(...leftLabels.map((t) => t.x + t.width - cell.x))
      : 0;

  // Prefer below-title whenever a real header sits on top. Left layout only
  // for short single-row cells with a side label and no header (e.g. Description of Work).
  const useLeftLayout =
    leftLabels.length > 0 &&
    leftLabelWidth < cell.width * 0.45 &&
    !hasWideTopTitle &&
    cell.height <= 48;

  let left = cell.x + edge;
  let top = cell.y + edge;
  let right = cellRight - edge;
  let bottom = cellBottom - edge;

  if (useLeftLayout) {
    // Fill everything to the RIGHT of the label, full cell height
    let labelRight = cell.x;
    for (const t of leftLabels) {
      labelRight = Math.max(labelRight, t.x + t.width);
    }
    left = Math.min(labelRight + 3, cellRight - 24);
    top = cell.y + edge;
    bottom = cellBottom - edge;
  } else if (hasWideTopTitle || (topTitles.length > 0 && !useLeftLayout)) {
    // Fill BELOW the title only — FROM/TO stay in the write row so dates
    // can be typed beside them. Never cap with maxReserve (that re-covered titles).
    let titleBottom = cell.y;
    for (const t of topTitles) {
      if (isSublabel(t)) continue;
      titleBottom = Math.max(titleBottom, t.y + glyphHeight(t));
    }
    top = Math.max(titleBottom + 3, cell.y + edge);
    left = cell.x + edge;
    right = cellRight - edge;
    bottom = cellBottom - edge;
  }

  const minH = 12;
  const minW = 24;
  // Never yank top back over a header just to satisfy minH
  if (top > bottom - minH && !hasWideTopTitle) {
    top = Math.max(cell.y + edge, bottom - minH);
  }
  if (left > right - minW) left = Math.max(cell.x + edge, right - minW);

  return {
    x: left,
    y: Math.min(top, bottom - 8),
    width: Math.max(minW, right - left),
    height: Math.max(8, bottom - Math.min(top, bottom - 8)),
  };
}

/**
 * Expand undersized widgets to their ruled cell, then fill empty interior.
 */
export function shrinkFieldAwayFromPrintedText(
  field: FormField,
  printed: PrintedTextBox[],
  drawnBoxes: DrawnBox[] = [],
): FormField {
  if (field.type !== 'text' && field.type !== 'date') return field;

  const cell =
    drawnBoxes.length > 0
      ? expandRectToContainingDrawnBox(field.rect, drawnBoxes)
      : field.rect;

  const printedInCell = printed.filter((t) => overlaps(t, cell));
  const fitted = fitFillRectInClosedBox(cell, printedInCell);

  if (
    Math.abs(fitted.x - field.rect.x) < 0.5 &&
    Math.abs(fitted.y - field.rect.y) < 0.5 &&
    Math.abs(fitted.width - field.rect.width) < 0.5 &&
    Math.abs(fitted.height - field.rect.height) < 0.5
  ) {
    return field;
  }

  return { ...field, rect: fitted };
}

/** Map pdf.js text items into top-left page boxes using the same viewport as widgets. */
export function printedTextFromPdfJsItems(
  items: Array<{
    str?: string;
    transform?: number[];
    width?: number;
    height?: number;
  }>,
  viewport: {
    convertToViewportPoint: (x: number, y: number) => number[];
  },
): PrintedTextBox[] {
  const out: PrintedTextBox[] = [];
  for (const item of items) {
    if (typeof item.str !== 'string' || !item.str.trim()) continue;
    const transform = item.transform;
    if (!transform || transform.length < 6) continue;
    const pdfX = transform[4] ?? 0;
    const pdfBaseline = transform[5] ?? 0;
    const fontSize = Math.min(
      18,
      Math.max(
        7,
        Math.hypot(transform[2] ?? 0, transform[3] ?? 0) ||
          (item.height ?? 0) ||
          10,
      ),
    );
    const pdfW = Math.max(item.width ?? 0, 1);
    const [vx0, vyBaseline] = viewport.convertToViewportPoint(
      pdfX,
      pdfBaseline,
    );
    const [vx1] = viewport.convertToViewportPoint(pdfX + pdfW, pdfBaseline);
    const yTop = (vyBaseline ?? 0) - fontSize;
    out.push({
      str: item.str,
      x: Math.min(vx0 ?? 0, vx1 ?? 0),
      y: yTop,
      width: Math.max(1, Math.abs((vx1 ?? 0) - (vx0 ?? 0))),
      height: fontSize,
    });
  }
  return out;
}
