import { v4 as uuidv4 } from 'uuid';
import type {
  FormField,
  FormFieldRect,
  FormFieldType,
  SmartFillSuggestion,
} from '../document/types.ts';
import type { DrawnBox } from './detectDrawnBoxes.ts';
import { shrinkFieldAwayFromPrintedText } from './fitFieldAwayFromPrintedText.ts';

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

/** Section titles — not fill lines (avoids huge boxes over SHIPPER / CONSIGNEE headers). */
const SECTION_HEADER_RE =
  /^(shipper|consignee|notify party|notify|description of goods|marks\s*&?\s*no\.?s?|shipping charges|handling information|declared value)\s*:?\s*$/i;

/** Labels that are prose / headings — never invent a fillable from these alone. */
const NON_FILL_LABEL_RE =
  /^(note|notes|disclaimer|warning|important|instructions?|attorney|declaration|affirmation|see\s+above|continued)\s*:?\s*$/i;

/** Common form labels — Bill of Lading / shipping / invoices */
const LINE_FIELD_PATTERNS: Array<{
  re: RegExp;
  type: FormFieldType;
  height: number;
  minWidth: number;
}> = [
  { re: /^name\s*:?\s*$/i, type: 'text', height: 22, minWidth: 180 },
  { re: /^address\s*:?\s*$/i, type: 'text', height: 22, minWidth: 220 },
  { re: /^contact\s*:?\s*$/i, type: 'text', height: 22, minWidth: 160 },
  { re: /^tel(?:ephone)?\s*:?\s*$/i, type: 'text', height: 22, minWidth: 140 },
  { re: /^email\s*:?\s*$/i, type: 'text', height: 22, minWidth: 180 },
  { re: /^fax\s*:?\s*$/i, type: 'text', height: 22, minWidth: 140 },
  {
    re: /^tax\s*id(?:\/ein)?#?\s*:?\s*$/i,
    type: 'text',
    height: 22,
    minWidth: 160,
  },
  { re: /^ein\s*#?\s*:?\s*$/i, type: 'text', height: 22, minWidth: 140 },
  {
    re: /^request\s*routing\s*:?\s*$/i,
    type: 'text',
    height: 22,
    minWidth: 160,
  },
  { re: /^phone\s*:?\s*$/i, type: 'text', height: 22, minWidth: 140 },
  { re: /^city\s*:?\s*$/i, type: 'text', height: 22, minWidth: 120 },
  { re: /^state\s*:?\s*$/i, type: 'text', height: 22, minWidth: 80 },
  { re: /^zip(?:\s*code)?\s*:?\s*$/i, type: 'text', height: 22, minWidth: 80 },
  { re: /^company\s*:?\s*$/i, type: 'text', height: 22, minWidth: 180 },
];

const CHECKBOX_WORD_LABELS = [
  'ocean',
  'air',
  'yes',
  'no',
  'agree',
  'accept',
  'ground',
  'express',
  'rail',
  'truck',
  'delivery',
  'will call',
  'willcall',
  'prepaid',
  'collect',
  'comp',
  'incomp',
  'complete',
  'incomplete',
  'speak',
  'read',
  'write',
  'understand',
  'male',
  'female',
  'other',
];

/** Longer shipping-option phrases (printed box sits left of the label). */
const CHECKBOX_PHRASE_RES: RegExp[] = [
  /paid\s+at\s+origin/i,
  /paid\s+at\s+destination/i,
  /\bprepaid\b/i,
  /\bcollect\b/i,
  /please\s+pick\s*up/i,
  /will\s+drop\s*off/i,
  /will\s+call/i,
  /\bdelivery\b/i,
  /\bocean\b/i,
  /\bair\b/i,
  /employment\s+application/i,
  /cover\s+letter/i,
  /resume/i,
  /diploma/i,
  /transcript/i,
  /police\s+clearance/i,
  /legal\s+right/i,
];

function isCheckboxOptionLabel(label: string): boolean {
  const lower = label.toLowerCase().trim();
  if (!lower || lower.length > 80) return false;
  // Section headers are not options
  if (SECTION_HEADER_RE.test(label)) return false;
  const wordKey = lower.replace(/[^a-z ]/g, '').trim();
  const compact = wordKey.replace(/\s+/g, '');
  if (
    CHECKBOX_WORD_LABELS.includes(compact) ||
    CHECKBOX_WORD_LABELS.includes(wordKey)
  ) {
    return true;
  }
  return CHECKBOX_PHRASE_RES.some((re) => re.test(label));
}
function clampConfidence(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function itemX(item: TextItemHint): number {
  return item.transform[4] ?? 0;
}

function itemYTop(item: TextItemHint, pageHeight: number): number {
  const baseline = item.transform[5] ?? 0;
  return pageHeight - baseline - item.height;
}

function normalizeLabel(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function rectsOverlap(a: FormFieldRect, b: FormFieldRect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

/** Tiny near-square widgets are checkboxes, not type-in fields. */
export function isCheckboxSizedRect(rect: FormFieldRect): boolean {
  const maxSide = Math.max(rect.width, rect.height);
  const minSide = Math.min(rect.width, rect.height);
  if (maxSide <= 0 || maxSide > 32) return false;
  return minSide / maxSide >= 0.55;
}

function coerceCheckboxValue(value: string): string {
  const v = value.trim().toLowerCase();
  if (
    v === 'true' ||
    v === 'yes' ||
    v === 'on' ||
    v === '1' ||
    v === 'x' ||
    v === '✓' ||
    v === '✔' ||
    v === '☑' ||
    v === '☒'
  ) {
    return 'true';
  }
  return 'false';
}

/**
 * Weak fallback when page text isn't available yet.
 * Prefer shrinkFieldAwayFromPrintedText (real titles inside the cell).
 */
export function insetTextFieldFromLabelBand(field: FormField): FormField {
  if (field.type !== 'text' && field.type !== 'date') return field;
  const { height, width } = field.rect;
  if (height < 40) return field;
  if (height <= 48 && width >= height * 5) return field;
  // Tiny reserve only — real titles are handled by shrinkFieldAwayFromPrintedText
  const topInset = Math.min(14, Math.max(10, Math.round(height * 0.1)));
  const newHeight = height - topInset - 2;
  if (newHeight < 12) return field;
  return {
    ...field,
    rect: {
      ...field.rect,
      y: field.rect.y + topInset,
      height: newHeight,
    },
  };
}

/**
 * Fix mis-typed checkbox widgets (common AcroForm / Smart Fill mistake:
 * a 14×14 square becomes a text box showing a truncated placeholder like "pre").
 */
export function normalizeFieldType(field: FormField): FormField {
  if (field.type === 'checkbox' || field.type === 'radio') {
    return field.placeholder ? { ...field, placeholder: '' } : field;
  }

  const nameHint = field.name
    .replace(/^smartfill:/i, '')
    .replace(/#[0-9]+$/i, '')
    .replace(/:[a-f0-9-]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  const looksLikeCheck =
    field.type === 'text' &&
    (isCheckboxSizedRect(field.rect) ||
      (isCheckboxOptionLabel(nameHint) &&
        field.rect.width <= 40 &&
        field.rect.height <= 28));

  if (looksLikeCheck) {
    return {
      ...field,
      type: 'checkbox',
      value: coerceCheckboxValue(field.value),
      placeholder: '',
    };
  }

  // Narrow leftovers shouldn't show truncated garbage placeholders ("pre…")
  let next = field;
  if (
    field.type === 'text' &&
    field.rect.width < 40 &&
    field.placeholder &&
    field.placeholder.length > 2
  ) {
    next = { ...field, placeholder: '' };
  }

  // Title-band inset is handled by shrinkFieldAwayFromPrintedText (page text)
  return next;
}

/** True when two rects are the same control (overlap / stacked duplicates). */
export function fieldsClash(a: FormFieldRect, b: FormFieldRect): boolean {
  const overlapW = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  );
  const overlapH = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  const overlapArea = overlapW * overlapH;
  const areaA = Math.max(1, a.width * a.height);
  const areaB = Math.max(1, b.width * b.height);

  if (overlapArea > 0) {
    const iou = overlapArea / (areaA + areaB - overlapArea);
    if (iou >= 0.18) return true;
    // Same-row partial overlap — for wide text cells, not checkbox grids
    const bothCheckboxSized =
      Math.max(a.width, a.height) <= 28 &&
      Math.max(b.width, b.height) <= 28 &&
      Math.min(a.width, a.height) / Math.max(a.width, a.height) >= 0.55 &&
      Math.min(b.width, b.height) / Math.max(b.width, b.height) >= 0.55;
    if (!bothCheckboxSized) {
      const minH = Math.min(a.height, b.height);
      const midA = a.y + a.height / 2;
      const midB = b.y + b.height / 2;
      if (Math.abs(midA - midB) <= minH * 0.8) {
        const minW = Math.min(a.width, b.width);
        if (overlapW >= minW * 0.35) return true;
      }
    }
  }

  // Stacked duplicates only — language grids sit ~16–30px apart and must stay.
  const acx = a.x + a.width / 2;
  const acy = a.y + a.height / 2;
  const bcx = b.x + b.width / 2;
  const bcy = b.y + b.height / 2;
  const bothSmall =
    a.width <= 28 && a.height <= 28 && b.width <= 28 && b.height <= 28;
  if (bothSmall && Math.hypot(acx - bcx, acy - bcy) < 8) return true;

  return false;
}

/** Drop Smart Fill hits that sit on top of existing AcroForm / already-accepted fields. */
export function filterSuggestionsAgainstFields(
  suggestions: SmartFillSuggestion[],
  fields: FormField[],
): SmartFillSuggestion[] {
  if (fields.length === 0) return suggestions;
  return suggestions.filter(
    (s) =>
      !fields.some(
        (f) => f.pageIndex === s.pageIndex && fieldsClash(f.rect, s.rect),
      ),
  );
}

/** Prefer real AcroForm fields; drop stacked duplicates. Prefer named over Text12. */
export function dedupeFormFields(fields: FormField[]): FormField[] {
  const bare = (n: string) => n.replace(/#\d+$/, '');
  const isGeneric = (n: string) => /^text\d+$/i.test(bare(n));
  const rank = (f: FormField): number => {
    if (f.synthetic) return 0;
    if (isGeneric(f.name)) return 1;
    if (f.type === 'checkbox' || f.type === 'radio') return 4;
    return 3;
  };

  const sorted = [...fields].map(normalizeFieldType).sort((a, b) => {
    const rd = rank(b) - rank(a);
    if (rd !== 0) return rd;
    // Prefer checkboxes over text when both synthetic
    const kindRank = (f: FormField) =>
      f.type === 'checkbox' || f.type === 'radio' ? 2 : 0;
    const kd = kindRank(b) - kindRank(a);
    if (kd !== 0) return kd;
    return a.rect.width * a.rect.height - b.rect.width * b.rect.height;
  });
  const kept: FormField[] = [];
  for (const f of sorted) {
    if (
      kept.some((k) => k.pageIndex === f.pageIndex && fieldsClash(k.rect, f.rect))
    ) {
      continue;
    }
    // Drop orphan TextN that sit in the same row band as a named field
    if (isGeneric(f.name)) {
      const nearNamed = kept.some((k) => {
        if (k.pageIndex !== f.pageIndex || isGeneric(k.name)) return false;
        const midF = f.rect.y + f.rect.height / 2;
        const midK = k.rect.y + k.rect.height / 2;
        const overlapW = Math.max(
          0,
          Math.min(f.rect.x + f.rect.width, k.rect.x + k.rect.width) -
            Math.max(f.rect.x, k.rect.x),
        );
        return (
          Math.abs(midF - midK) <= Math.max(f.rect.height, k.rect.height) * 1.25 &&
          overlapW > 4
        );
      });
      if (nearNamed) continue;
    }
    kept.push(f);
  }
  return kept.sort(
    (a, b) =>
      a.pageIndex - b.pageIndex || a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  );
}

/** Clean label for grey placeholder text inside the box. */
export function placeholderFromLabel(label: string | undefined, kind: string): string {
  if (!label) {
    if (kind === 'checkbox') return '';
    if (kind === 'date') return 'Date';
    if (kind === 'signature') return 'Signature';
    return 'Type here';
  }
  const cleaned = label.replace(/:+\s*$/, '').trim();
  if (!cleaned || cleaned === 'Blank line' || cleaned === 'Possible blank field') {
    return 'Type here';
  }
  return cleaned;
}

function isDateLabel(lower: string): boolean {
  // Word-aware — do not match "validate", "candidate", etc.
  return (
    /\bdate\b/.test(lower) ||
    /\bdated\b/.test(lower) ||
    /^date\s*:/.test(lower)
  );
}

function isSignatureLabel(lower: string): boolean {
  return SIGNATURE_KEYWORDS.some((k) => lower.includes(k));
}

function isBlankLineText(label: string): boolean {
  const t = label.trim();
  if (!t) return false;
  return (
    /^[_\.\-…]{4,}$/.test(t) ||
    (t.includes('___') && t.replace(/[^_]/g, '').length >= 4) ||
    (t.includes('...') && t.replace(/[^\.]/g, '').length >= 6)
  );
}

function sameTextRow(
  a: TextItemHint,
  b: TextItemHint,
  pageHeight: number,
): boolean {
  const ay = itemYTop(a, pageHeight) + a.height / 2;
  const by = itemYTop(b, pageHeight) + b.height / 2;
  const tol = Math.max(10, Math.max(a.height, b.height) * 0.85);
  return Math.abs(ay - by) <= tol;
}

/** Underscore / dotted blank on the same row, to the right of a label. */
function findBlankToRightOfLabel(
  items: TextItemHint[],
  pageHeight: number,
  labelItem: TextItemHint,
): TextItemHint | null {
  const labelRight = itemX(labelItem) + labelItem.width;
  let best: TextItemHint | null = null;
  let bestX = Infinity;
  for (const item of items) {
    if (item === labelItem) continue;
    if (!isBlankLineText(normalizeLabel(item.str))) continue;
    if (!sameTextRow(labelItem, item, pageHeight)) continue;
    const x = itemX(item);
    // Allow slight overlap with the label end (common on scanned forms)
    if (x + item.width < labelRight - 8) continue;
    if (x < bestX) {
      bestX = x;
      best = item;
    }
  }
  return best;
}

/** Real words already sit in the fill area — don't invent another field. */
function hasFilledValueBesideLabel(
  items: TextItemHint[],
  pageHeight: number,
  labelItem: TextItemHint,
  blankItem: TextItemHint | null,
): boolean {
  const labelRight = itemX(labelItem) + labelItem.width;
  for (const item of items) {
    if (item === labelItem || item === blankItem) continue;
    const t = normalizeLabel(item.str);
    if (!t || isBlankLineText(t)) continue;
    if (!sameTextRow(labelItem, item, pageHeight)) continue;
    if (itemX(item) < labelRight - 4) continue;
    // Ignore tiny punctuation crumbs
    if (t.replace(/[^\w]/g, '').length === 0) continue;
    return true;
  }
  return false;
}

/**
 * Prefer a blank/underline. Optionally use empty gap to the right (table cells
 * without underscore glyphs). Keep allowGap off for signature so we don't
 * invent huge sign areas from a lone "Signature:" label.
 */
function blankFillRectForLabel(
  items: TextItemHint[],
  pageHeight: number,
  pageWidth: number,
  labelItem: TextItemHint,
  minWidth: number,
  height: number,
  allowGap = true,
): FormFieldRect | null {
  const blank = findBlankToRightOfLabel(items, pageHeight, labelItem);
  if (blank) {
    if (hasFilledValueBesideLabel(items, pageHeight, labelItem, blank)) {
      return null;
    }
    const x = itemX(blank);
    const y = itemYTop(blank, pageHeight) - 2;
    return {
      x,
      y,
      width: Math.max(minWidth, blank.width, 80),
      height: Math.min(24, Math.max(height, blank.height + 6)),
    };
  }

  if (!allowGap) return null;
  // Gap fills are a last resort and often spill into the next column —
  // keep them narrow.
  if (hasFilledValueBesideLabel(items, pageHeight, labelItem, null)) {
    return null;
  }
  const labelRight = itemX(labelItem) + labelItem.width;
  const labelMidY = itemYTop(labelItem, pageHeight) + labelItem.height / 2;
  let nextX = pageWidth - 18;
  for (const item of items) {
    if (item === labelItem) continue;
    if (!sameTextRow(labelItem, item, pageHeight)) continue;
    const x = itemX(item);
    if (x < labelRight + 6) continue;
    nextX = Math.min(nextX, x - 4);
  }
  const gap = nextX - (labelRight + 4);
  if (gap < 40) return null;
  const maxGap = Math.min(140, pageWidth * 0.28);
  const width = Math.min(gap, maxGap);
  if (width < 36) return null;
  return {
    x: labelRight + 4,
    y: labelMidY - height / 2,
    width,
    height,
  };
}

/**
 * Final safety pass: clip text fields so they never spill into the next
 * box on the same row/column (the "overfilling" bug on ruled forms).
 */
export function clipSuggestionsToNeighbors(
  suggestions: SmartFillSuggestion[],
  pageWidth: number,
): SmartFillSuggestion[] {
  const pad = 3;
  const result = suggestions.map((s) => ({
    ...s,
    rect: { ...s.rect },
  }));

  const isTextual = (s: SmartFillSuggestion) =>
    s.kind === 'text' || s.kind === 'date' || s.kind === 'signature';

  const texts = result.filter(isTextual);
  const used = new Set<string>();

  // Horizontal: shrink width so we stop before the next field on the row
  for (const s of texts) {
    if (used.has(s.id)) continue;
    const midY = s.rect.y + s.rect.height / 2;
    const row = texts
      .filter((o) => Math.abs(o.rect.y + o.rect.height / 2 - midY) <= 12)
      .sort((a, b) => a.rect.x - b.rect.x);
    for (const r of row) used.add(r.id);

    for (let i = 0; i < row.length; i++) {
      const cur = row[i]!;
      const next = row[i + 1];
      let maxRight = pageWidth - 8;
      if (next) maxRight = Math.min(maxRight, next.rect.x - pad);
      cur.rect.width = Math.min(cur.rect.width, Math.max(8, maxRight - cur.rect.x));
      if (cur.kind !== 'signature') {
        cur.rect.width = Math.min(cur.rect.width, pageWidth * 0.4);
      }
      cur.rect.height = Math.min(
        cur.rect.height,
        cur.kind === 'signature' ? 48 : 22,
      );
    }
  }

  // Vertical: shrink height so we stop before the next field below
  used.clear();
  for (const s of texts) {
    if (used.has(s.id)) continue;
    const midX = s.rect.x + s.rect.width / 2;
    const col = texts
      .filter((o) => Math.abs(o.rect.x + o.rect.width / 2 - midX) <= 20)
      .sort((a, b) => a.rect.y - b.rect.y);
    for (const c of col) used.add(c.id);

    for (let i = 0; i < col.length; i++) {
      const cur = col[i]!;
      const next = col[i + 1];
      if (!next) continue;
      const maxBottom = next.rect.y - pad;
      cur.rect.height = Math.min(
        cur.rect.height,
        Math.max(8, maxBottom - cur.rect.y),
      );
    }
  }

  return result.filter((s) => {
    if (!isTextual(s)) return true;
    return s.rect.width >= 12 && s.rect.height >= 8;
  });
}

/**
 * Heuristic Smart Fill detector for forms like shipping BOL sheets and
 * employment applications (ruled cells + drawn checkboxes).
 * Returns suggestions only — never mutates the document.
 */
export function detectSmartFillSuggestions(
  pageWidth: number,
  pageHeight: number,
  pageIndex: number,
  textItems?: TextItemHint[],
  drawnBoxes?: DrawnBox[],
): SmartFillSuggestion[] {
  const suggestions: SmartFillSuggestion[] = [];
  const items = textItems ?? [];
  const boxes = drawnBoxes ?? [];
  // When the page has ruled cells, skip gap-from-label (major overfill source)
  const allowLabelGaps = boxes.length < 3;

  // 0) Vector-drawn cells / checkbox squares (primary for table-style PDFs)
  for (const box of boxes) {
    if (box.kind === 'checkbox') {
      suggestions.push({
        id: uuidv4(),
        kind: 'checkbox',
        pageIndex,
        rect: {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        },
        confidence: 0.92,
        label: 'Checkbox',
        confirmed: false,
      });
      continue;
    }
    // Prefer type-in area below/beside any printed title inside the cell
    const inset = 2.5;
    const provisional = {
      id: 'tmp',
      name: 'Blank field',
      type: 'text' as const,
      pageIndex,
      rect: {
        x: box.x + inset,
        y: box.y + inset,
        width: Math.max(16, box.width - inset * 2),
        height: Math.max(12, box.height - inset * 2),
      },
      value: '',
    };
    const printedInBox = items
      .map((item) => {
        const t = normalizeLabel(item.str);
        if (!t || isBlankLineText(t)) return null;
        return {
          str: t,
          x: itemX(item),
          y: itemYTop(item, pageHeight),
          width: item.width,
          height: Math.max(item.height, 6),
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);
    // Skip only if the cell is mostly filled body text (not just a title band)
    const bodyText = printedInBox.filter((t) => {
      const cy = t.y + t.height / 2;
      return cy > box.y + Math.max(18, box.height * 0.35);
    });
    if (bodyText.length >= 3) continue;

    const fitted = shrinkFieldAwayFromPrintedText(
      provisional,
      printedInBox,
      [box],
    );
    if (fitted.rect.height < 10 || fitted.rect.width < 16) continue;
    suggestions.push({
      id: uuidv4(),
      kind: 'text',
      pageIndex,
      rect: fitted.rect,
      confidence: 0.7,
      label: 'Blank field',
      confirmed: false,
    });
  }

  // 1) Labeled fill lines — blank/underline OR empty gap to the right
  for (const item of items) {
    const label = normalizeLabel(item.str);
    if (!label) continue;
    if (SECTION_HEADER_RE.test(label)) continue;
    if (NON_FILL_LABEL_RE.test(label)) continue;

    const lower = label.toLowerCase();
    const matched = LINE_FIELD_PATTERNS.find((p) => p.re.test(label));
    const genericColon =
      !matched &&
      /^[A-Za-z][A-Za-z0-9 /&#-]{1,40}:\s*$/.test(label) &&
      label.length <= 36 &&
      !isSignatureLabel(lower) &&
      !isDateLabel(lower);

    if (!matched && !genericColon) continue;

    const minWidth = matched?.minWidth ?? 120;
    const height = matched?.height ?? 22;
    const rect = blankFillRectForLabel(
      items,
      pageHeight,
      pageWidth,
      item,
      minWidth,
      height,
      allowLabelGaps,
    );
    if (!rect) continue;

    suggestions.push({
      id: uuidv4(),
      kind: matched?.type ?? 'text',
      pageIndex,
      rect,
      confidence: clampConfidence(matched ? 0.9 : 0.75),
      label,
      confirmed: false,
    });
  }

  // 2) Tel / Email on same line — only with blanks to the right
  for (const item of items) {
    const label = normalizeLabel(item.str);
    if (!/tel\s*\/\s*email/i.test(label) && !/phone\s*\/\s*email/i.test(label)) {
      continue;
    }
    const blank = findBlankToRightOfLabel(items, pageHeight, item);
    if (!blank) continue;
    if (hasFilledValueBesideLabel(items, pageHeight, item, blank)) continue;
    const start = itemX(blank);
    const y = itemYTop(blank, pageHeight) - 2;
    const avail = Math.max(blank.width, 160);
    const half = avail / 2 - 6;
    suggestions.push({
      id: uuidv4(),
      kind: 'text',
      pageIndex,
      rect: { x: start, y, width: half, height: 22 },
      confidence: 0.8,
      label: 'Tel',
      confirmed: false,
    });
    suggestions.push({
      id: uuidv4(),
      kind: 'text',
      pageIndex,
      rect: { x: start + half + 12, y, width: half, height: 22 },
      confidence: 0.8,
      label: 'Email',
      confirmed: false,
    });
  }

  // 3) Signature / date — blank line or gap
  for (const item of items) {
    const label = normalizeLabel(item.str);
    const lower = label.toLowerCase();
    if (NON_FILL_LABEL_RE.test(label)) continue;

    if (isSignatureLabel(lower)) {
      const rect = blankFillRectForLabel(
        items,
        pageHeight,
        pageWidth,
        item,
        160,
        36,
        false,
      );
      if (rect) {
        suggestions.push({
          id: uuidv4(),
          kind: 'signature',
          pageIndex,
          rect: { ...rect, height: Math.max(36, rect.height) },
          confidence: clampConfidence(
            0.8 + (lower.includes('sign here') ? 0.1 : 0),
          ),
          label,
          confirmed: false,
        });
      }
    }

    if (isDateLabel(lower) && !isSignatureLabel(lower)) {
      const rect = blankFillRectForLabel(
        items,
        pageHeight,
        pageWidth,
        item,
        100,
        22,
        false,
      );
      if (rect) {
        suggestions.push({
          id: uuidv4(),
          kind: 'date',
          pageIndex,
          rect,
          confidence: clampConfidence(0.78),
          label,
          confirmed: false,
        });
      }
    }
  }

  // 4) Checkboxes — glyphs, OR option words with a box to the left (or right)
  const BOX_GLYPHS = new Set(['□', '☐', '▢', '◻', '❏', '❐', '❑', '❒', '☑', '☒', '■', '□']);
  const checkboxHits: SmartFillSuggestion[] = [];
  const drawnChecks = (drawnBoxes ?? []).filter((b) => b.kind === 'checkbox');

  for (const item of items) {
    const label = normalizeLabel(item.str);
    const lower = label.toLowerCase();
    const x = itemX(item);
    const y = itemYTop(item, pageHeight);

    if (BOX_GLYPHS.has(label) || /^[\[\(]\s*[\]\)]$/.test(label)) {
      checkboxHits.push({
        id: uuidv4(),
        kind: 'checkbox',
        pageIndex,
        rect: {
          x,
          y: y + Math.max(0, (item.height - 14) / 2),
          width: Math.max(12, Math.min(18, item.width || 14)),
          height: Math.max(12, Math.min(18, item.height || 14)),
        },
        confidence: 0.9,
        label: 'Checkbox',
        confirmed: false,
      });
      continue;
    }

    if (!isCheckboxOptionLabel(label)) continue;

    // Prefer a real drawn square beside the label when available
    const labelCx = x + item.width / 2;
    const labelCy = y + item.height / 2;
    const nearDrawn = drawnChecks.find((b) => {
      const bx = b.x + b.width / 2;
      const by = b.y + b.height / 2;
      const dx = bx - labelCx;
      const dy = by - labelCy;
      return Math.abs(dy) <= Math.max(14, item.height) && Math.abs(dx) <= 36;
    });
    if (nearDrawn) {
      checkboxHits.push({
        id: uuidv4(),
        kind: 'checkbox',
        pageIndex,
        rect: {
          x: nearDrawn.x,
          y: nearDrawn.y,
          width: nearDrawn.width,
          height: nearDrawn.height,
        },
        confidence: 0.92,
        label: lower.replace(/[^a-z ]/g, '').trim() || label,
        confirmed: false,
      });
      continue;
    }

    checkboxHits.push({
      id: uuidv4(),
      kind: 'checkbox',
      pageIndex,
      rect: {
        x: Math.max(4, x - 18),
        y: y + (item.height - 14) / 2,
        width: 14,
        height: 14,
      },
      confidence: 0.8,
      label: lower.replace(/[^a-z ]/g, '').trim() || label,
      confirmed: false,
    });
  }

  suggestions.push(...checkboxHits);

  // 5) Standalone underscore / dotted blank lines (no label required)
  for (const item of items) {
    const label = normalizeLabel(item.str);
    if (!isBlankLineText(label)) continue;

    const rect = {
      x: itemX(item),
      y: itemYTop(item, pageHeight) - 4,
      width: Math.max(item.width, 80),
      height: Math.max(20, Math.min(24, item.height + 8)),
    };
    // Tiny squares are checkboxes — never invent a type-in field on them
    if (isCheckboxSizedRect({ x: itemX(item), y: itemYTop(item, pageHeight), width: item.width, height: item.height })) {
      continue;
    }
    if (suggestions.some((s) => fieldsClash(s.rect, rect))) continue;

    // Skip if non-blank text already sits on this blank (filled form)
    const coveredByValue = items.some((other) => {
      if (other === item) return false;
      const t = normalizeLabel(other.str);
      if (!t || isBlankLineText(t)) return false;
      if (!sameTextRow(item, other, pageHeight)) return false;
      const ox = itemX(other);
      return ox >= rect.x - 4 && ox <= rect.x + rect.width;
    });
    if (coveredByValue) continue;

    suggestions.push({
      id: uuidv4(),
      kind: 'text',
      pageIndex,
      rect,
      confidence: clampConfidence(0.55),
      label: 'Blank line',
      confirmed: false,
    });
  }

  // Deduplicate — prefer checkboxes over text when they clash
  const suggestionPriority = (s: SmartFillSuggestion): number => {
    const kindBoost =
      s.kind === 'checkbox' || s.kind === 'radio'
        ? 2
        : s.kind === 'signature'
          ? 1
          : 0;
    return kindBoost + s.confidence;
  };
  const sorted = [...suggestions].sort((a, b) => {
    const pd = suggestionPriority(b) - suggestionPriority(a);
    if (Math.abs(pd) > 0.05) return pd > 0 ? 1 : -1;
    // Same tier → keep the tighter box (avoids overfilling table cells)
    return (
      a.rect.width * a.rect.height - b.rect.width * b.rect.height
    );
  });
  const kept: SmartFillSuggestion[] = [];
  for (const s of sorted) {
    if (kept.some((k) => fieldsClash(k.rect, s.rect))) continue;
    let next = s;
    // Square text ghosts → real checkbox toggles
    if (
      (next.kind === 'text' || next.kind === 'date') &&
      isCheckboxSizedRect(next.rect)
    ) {
      next = { ...next, kind: 'checkbox', label: next.label ?? 'Checkbox' };
    }
    if (next.kind === 'text' || next.kind === 'date') {
      // Keep taller drawn answer cells; only clamp underscore-style shorts
      if (next.rect.height <= 32) {
        next = {
          ...next,
          rect: {
            ...next.rect,
            height: Math.min(next.rect.height, 28),
          },
        };
      }
    }
    if (next.kind === 'checkbox') {
      next = {
        ...next,
        rect: {
          ...next.rect,
          width: Math.min(Math.max(next.rect.width, 10), 22),
          height: Math.min(Math.max(next.rect.height, 10), 22),
        },
      };
    }
    kept.push({ ...next, confirmed: false });
  }

  return clipSuggestionsToNeighbors(kept, pageWidth);
}

/** Map a Smart Fill suggestion to a typeable FormField (synthetic — drawn on export). */
export function suggestionToFormField(
  suggestion: SmartFillSuggestion,
): FormField {
  const kind = suggestion.kind;
  let type: FormFieldType = 'text';
  if (kind === 'checkbox') type = 'checkbox';
  else if (kind === 'date') type = 'date';
  else if (kind === 'signature') type = 'signature';
  else if (kind === 'dropdown') type = 'dropdown';
  else if (kind === 'radio') type = 'radio';
  else type = 'text';

  return normalizeFieldType({
    id: suggestion.id,
    name: `smartfill:${suggestion.label ?? suggestion.kind}:${suggestion.id.slice(0, 8)}`,
    type,
    pageIndex: suggestion.pageIndex,
    rect: { ...suggestion.rect },
    value: type === 'checkbox' ? 'false' : '',
    placeholder:
      type === 'checkbox'
        ? ''
        : placeholderFromLabel(suggestion.label, type),
    synthetic: true,
  });
}
