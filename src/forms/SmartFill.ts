import { v4 as uuidv4 } from 'uuid';
import type {
  FormField,
  FormFieldRect,
  FormFieldType,
  SmartFillSuggestion,
} from '../document/types.ts';

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
  'rail',
  'truck',
  'delivery',
  'will call',
  'willcall',
  'prepaid',
  'collect',
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

/** True when two rects are the same control (overlap, same row, or tiny checkbox neighbors). */
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
    const minH = Math.min(a.height, b.height);
    const midA = a.y + a.height / 2;
    const midB = b.y + b.height / 2;
    if (Math.abs(midA - midB) <= minH * 0.8) {
      const minW = Math.min(a.width, b.width);
      if (overlapW >= minW * 0.35) return true;
    }
  }

  // Nearby checkbox-sized hits
  const acx = a.x + a.width / 2;
  const acy = a.y + a.height / 2;
  const bcx = b.x + b.width / 2;
  const bcy = b.y + b.height / 2;
  const bothSmall = a.width <= 28 && a.height <= 28 && b.width <= 28 && b.height <= 28;
  if (bothSmall && Math.hypot(acx - bcx, acy - bcy) < 20) return true;

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

  const sorted = [...fields].sort((a, b) => {
    const rd = rank(b) - rank(a);
    if (rd !== 0) return rd;
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
 * Only offer a labeled fillable when there is a visible blank/underline to write in.
 * Never invent fields on plain labels (e.g. "Note:") or already-filled lines.
 */
function blankFillRectForLabel(
  items: TextItemHint[],
  pageHeight: number,
  labelItem: TextItemHint,
  minWidth: number,
  height: number,
): FormFieldRect | null {
  const blank = findBlankToRightOfLabel(items, pageHeight, labelItem);
  if (!blank) return null;
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

/**
 * Heuristic Smart Fill detector for forms like shipping BOL sheets.
 * Returns suggestions only — never mutates the document.
 * Text / date / signature require a real blank/underline line — no ghost fields.
 */
export function detectSmartFillSuggestions(
  pageWidth: number,
  pageHeight: number,
  pageIndex: number,
  textItems?: TextItemHint[],
): SmartFillSuggestion[] {
  const suggestions: SmartFillSuggestion[] = [];
  const items = textItems ?? [];

  // 1) Labeled fill lines — only when a blank/underline sits to the right
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
      !isSignatureLabel(lower) &&
      !isDateLabel(lower);

    if (!matched && !genericColon) continue;

    const minWidth = matched?.minWidth ?? 120;
    const height = matched?.height ?? 22;
    const rect = blankFillRectForLabel(
      items,
      pageHeight,
      item,
      minWidth,
      height,
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

  // 3) Signature / date — only with a blank line to write on
  for (const item of items) {
    const label = normalizeLabel(item.str);
    const lower = label.toLowerCase();
    if (NON_FILL_LABEL_RE.test(label)) continue;

    if (isSignatureLabel(lower)) {
      const rect = blankFillRectForLabel(items, pageHeight, item, 160, 36);
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
      const rect = blankFillRectForLabel(items, pageHeight, item, 100, 22);
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

  // 4) Checkboxes — only real box glyphs, OR a small square left of known option words.
  const BOX_GLYPHS = new Set(['□', '☐', '▢', '◻', '❏', '❐', '❑', '❒', '☑', '☒']);
  const checkboxHits: SmartFillSuggestion[] = [];

  for (const item of items) {
    const label = normalizeLabel(item.str);
    const lower = label.toLowerCase();
    const x = itemX(item);
    const y = itemYTop(item, pageHeight);

    if (BOX_GLYPHS.has(label)) {
      checkboxHits.push({
        id: uuidv4(),
        kind: 'checkbox',
        pageIndex,
        rect: {
          x,
          y: y + Math.max(0, (item.height - 14) / 2),
          width: 14,
          height: 14,
        },
        confidence: 0.9,
        label: 'Checkbox',
        confirmed: false,
      });
      continue;
    }

    const wordKey = lower.replace(/[^a-z ]/g, '').trim();
    if (isCheckboxOptionLabel(label)) {
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
        label: wordKey || label,
        confirmed: false,
      });
    }
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

  // Deduplicate (IoU / same-row / nearby checkboxes)
  const sorted = [...suggestions].sort((a, b) => b.confidence - a.confidence);
  const kept: SmartFillSuggestion[] = [];
  for (const s of sorted) {
    if (kept.some((k) => fieldsClash(k.rect, s.rect))) continue;
    if (s.kind === 'text' || s.kind === 'date') {
      s.rect = {
        ...s.rect,
        height: Math.min(s.rect.height, 24),
      };
    }
    if (s.kind === 'checkbox') {
      s.rect = {
        ...s.rect,
        width: 14,
        height: 14,
      };
    }
    kept.push({ ...s, confirmed: false });
  }

  return kept;
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

  return {
    id: suggestion.id,
    name: `smartfill:${suggestion.label ?? suggestion.kind}:${suggestion.id.slice(0, 8)}`,
    type,
    pageIndex: suggestion.pageIndex,
    rect: { ...suggestion.rect },
    value: type === 'checkbox' ? 'false' : '',
    placeholder: placeholderFromLabel(suggestion.label, type),
    synthetic: true,
  };
}
