import { v4 as uuidv4 } from 'uuid';
import type { SmartFillSuggestion } from '../document/types.ts';

export type TextItemHint = {
  str: string;
  /** PDF.js-style transform: [a, b, c, d, e, f] where e,f are x,y */
  transform: number[];
  width: number;
  height: number;
};

const SIGNATURE_KEYWORDS = [
  'signature',
  'sign here',
  'sign:',
  "signer's",
  'authorized signature',
];

const DATE_KEYWORDS = ['date', 'dated', 'date:'];

const CHECKBOX_LABEL_HINTS = [
  'yes',
  'no',
  'agree',
  'accept',
  'opt in',
  'opt-in',
];

function clampConfidence(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function itemX(item: TextItemHint): number {
  return item.transform[4] ?? 0;
}

function itemYTop(item: TextItemHint, pageHeight: number): number {
  // PDF transform y is baseline from bottom; approximate top-left UI y
  const baseline = item.transform[5] ?? 0;
  return pageHeight - baseline - item.height;
}

/**
 * Heuristic Smart Fill detector.
 * Returns suggestions only — never mutates the document.
 * All suggestions have `confirmed: false` until the user accepts them.
 */
export function detectSmartFillSuggestions(
  pageWidth: number,
  pageHeight: number,
  pageIndex: number,
  textItems?: TextItemHint[],
): SmartFillSuggestion[] {
  const suggestions: SmartFillSuggestion[] = [];
  const items = textItems ?? [];

  // 1) Signature / date keyword regions
  for (const item of items) {
    const label = item.str.trim();
    const lower = label.toLowerCase();
    const x = itemX(item);
    const y = itemYTop(item, pageHeight);

    const isSignature = SIGNATURE_KEYWORDS.some((k) => lower.includes(k));
    if (isSignature) {
      suggestions.push({
        id: uuidv4(),
        kind: 'signature',
        pageIndex,
        rect: {
          x: x + item.width + 8,
          y,
          width: Math.min(220, pageWidth - x - item.width - 16),
          height: Math.max(36, item.height * 1.8),
        },
        confidence: clampConfidence(0.72 + (lower.includes('sign here') ? 0.15 : 0)),
        label,
        confirmed: false,
      });
    }

    const isDate = DATE_KEYWORDS.some(
      (k) => lower === k || lower.startsWith(`${k} `) || lower.endsWith(` ${k}`),
    );
    if (isDate || (isSignature === false && lower.includes('date'))) {
      if (DATE_KEYWORDS.some((k) => lower.includes(k))) {
        suggestions.push({
          id: uuidv4(),
          kind: 'date',
          pageIndex,
          rect: {
            x: x + item.width + 8,
            y,
            width: 120,
            height: Math.max(24, item.height * 1.4),
          },
          confidence: clampConfidence(0.65),
          label,
          confirmed: false,
        });
      }
    }
  }

  // 2) Checkbox-sized squares near labels (inferred from short glyphs / □)
  for (const item of items) {
    const label = item.str.trim();
    const lower = label.toLowerCase();
    const looksLikeBox =
      label === '□' ||
      label === '☐' ||
      label === '▢' ||
      (item.width > 8 &&
        item.width < 22 &&
        item.height > 8 &&
        item.height < 22 &&
        label.length <= 2);

    const nearCheckboxLabel = CHECKBOX_LABEL_HINTS.some((h) =>
      lower.includes(h),
    );

    if (looksLikeBox || (nearCheckboxLabel && item.width < 28 && item.height < 28)) {
      suggestions.push({
        id: uuidv4(),
        kind: 'checkbox',
        pageIndex,
        rect: {
          x: itemX(item),
          y: itemYTop(item, pageHeight),
          width: Math.max(14, Math.min(22, item.width || 16)),
          height: Math.max(14, Math.min(22, item.height || 16)),
        },
        confidence: clampConfidence(looksLikeBox ? 0.8 : 0.55),
        label: label || undefined,
        confirmed: false,
      });
    }
  }

  // 3) Blank-line-ish underline regions: sequences of underscores / dots
  for (const item of items) {
    const label = item.str.trim();
    const underscoreHeavy =
      /^[_\.\-…]{4,}$/.test(label) ||
      (label.includes('___') && label.replace(/[^_]/g, '').length >= 4);

    if (!underscoreHeavy) continue;

    suggestions.push({
      id: uuidv4(),
      kind: 'text',
      pageIndex,
      rect: {
        x: itemX(item),
        y: itemYTop(item, pageHeight) - 4,
        width: Math.max(item.width, 80),
        height: Math.max(22, item.height + 8),
      },
      confidence: clampConfidence(0.6),
      label: 'Blank line',
      confirmed: false,
    });
  }

  // 4) Without text items, offer a weak blank-line band in the lower half
  //    (common form layout) — still unconfirmed.
  if (items.length === 0 && pageWidth > 0 && pageHeight > 0) {
    suggestions.push({
      id: uuidv4(),
      kind: 'text',
      pageIndex,
      rect: {
        x: pageWidth * 0.1,
        y: pageHeight * 0.55,
        width: pageWidth * 0.6,
        height: 28,
      },
      confidence: 0.25,
      label: 'Possible blank field',
      confirmed: false,
    });
  }

  return suggestions.map((s) => ({ ...s, confirmed: false }));
}
