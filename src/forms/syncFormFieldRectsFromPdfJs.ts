import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import type { FormField, FormFieldRect } from '../document/types.ts';
import { detectDrawnBoxes, type DrawnBox } from './detectDrawnBoxes.ts';
import {
  printedTextFromPdfJsItems,
  shrinkFieldAwayFromPrintedText,
  type PrintedTextBox,
} from './fitFieldAwayFromPrintedText.ts';
import { dedupeFormFields, normalizeFieldType } from './SmartFill.ts';

type AnnRect = {
  fieldName: string;
  pageIndex: number;
  rect: FormFieldRect;
};

function normalizeName(name: string): string {
  return name.replace(/#\d+$/, '').trim().toLowerCase();
}

function viewportRect(
  viewport: {
    convertToViewportPoint: (x: number, y: number) => number[];
  },
  pdfRect: number[],
): FormFieldRect {
  const x1 = pdfRect[0] ?? 0;
  const y1 = pdfRect[1] ?? 0;
  const x2 = pdfRect[2] ?? x1;
  const y2 = pdfRect[3] ?? y1;
  const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
  const [vx2, vy2] = viewport.convertToViewportPoint(x2, y2);
  return {
    x: Math.min(vx1 ?? 0, vx2 ?? 0),
    y: Math.min(vy1 ?? 0, vy2 ?? 0),
    width: Math.max(4, Math.abs((vx2 ?? 0) - (vx1 ?? 0))),
    height: Math.max(4, Math.abs((vy2 ?? 0) - (vy1 ?? 0))),
  };
}

function rectCenterDistance(a: FormFieldRect, b: FormFieldRect): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

function finishField(
  field: FormField,
  printedByPage: Map<number, PrintedTextBox[]>,
  drawnByPage: Map<number, DrawnBox[]>,
): FormField {
  const normalized = quietField(normalizeFieldType(field));
  const printed = printedByPage.get(normalized.pageIndex) ?? [];
  const drawn = drawnByPage.get(normalized.pageIndex) ?? [];
  return shrinkFieldAwayFromPrintedText(normalized, printed, drawn);
}

/**
 * Reposition AcroForm fields using pdf.js widget geometry at scale=1,
 * expand undersized widgets to their ruled cell, then fill empty interior.
 */
export async function syncFormFieldRectsFromPdfJs(
  doc: PDFDocumentProxy,
  fields: FormField[],
): Promise<FormField[]> {
  if (fields.length === 0) return fields;

  const anns: AnnRect[] = [];
  const printedByPage = new Map<number, PrintedTextBox[]>();
  const drawnByPage = new Map<number, DrawnBox[]>();

  for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex++) {
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    const annotations = await page.getAnnotations({ intent: 'display' });
    for (const ann of annotations) {
      if (ann.subtype !== 'Widget' || !Array.isArray(ann.rect)) continue;
      const fieldName =
        typeof ann.fieldName === 'string' && ann.fieldName.length > 0
          ? ann.fieldName
          : typeof ann.id === 'string'
            ? ann.id
            : '';
      if (!fieldName) continue;
      anns.push({
        fieldName,
        pageIndex,
        rect: viewportRect(viewport, ann.rect as number[]),
      });
    }

    try {
      const content = await page.getTextContent();
      printedByPage.set(
        pageIndex,
        printedTextFromPdfJsItems(
          content.items as Array<{
            str?: string;
            transform?: number[];
            width?: number;
            height?: number;
          }>,
          viewport,
        ),
      );
    } catch {
      printedByPage.set(pageIndex, []);
    }

    try {
      drawnByPage.set(
        pageIndex,
        await detectDrawnBoxes(page, viewport.width, viewport.height),
      );
    } catch {
      drawnByPage.set(pageIndex, []);
    }
  }

  if (anns.length === 0) {
    return dedupeFormFields(
      fields.map((f) => finishField(f, printedByPage, drawnByPage)),
    );
  }

  const usedAnn = new Set<number>();
  const synced = fields.map((field) => {
    const base = normalizeName(field.name);
    const widgetIdxMatch = field.name.match(/#(\d+)$/);
    const widgetIdx = widgetIdxMatch
      ? Number.parseInt(widgetIdxMatch[1]!, 10)
      : 0;

    const exactHits: number[] = [];
    for (let i = 0; i < anns.length; i++) {
      if (usedAnn.has(i)) continue;
      if (normalizeName(anns[i]!.fieldName) === base) exactHits.push(i);
    }

    let bestIdx = -1;
    if (exactHits.length === 1) {
      bestIdx = exactHits[0]!;
    } else if (exactHits.length > 1) {
      const onPage = exactHits.filter(
        (i) => anns[i]!.pageIndex === field.pageIndex,
      );
      const pool = onPage.length > 0 ? onPage : exactHits;
      bestIdx = pool[Math.min(widgetIdx, pool.length - 1)] ?? pool[0]!;
    } else {
      let bestScore = -1;
      for (let i = 0; i < anns.length; i++) {
        if (usedAnn.has(i)) continue;
        const a = anns[i]!;
        if (a.pageIndex !== field.pageIndex) continue;
        const dist = rectCenterDistance(a.rect, field.rect);
        if (dist > 28) continue;
        const score = Math.max(0, 40 - dist);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestScore < 20) bestIdx = -1;
    }

    if (bestIdx < 0) return finishField(field, printedByPage, drawnByPage);
    usedAnn.add(bestIdx);
    const hit = anns[bestIdx]!;
    return finishField(
      {
        ...field,
        pageIndex: hit.pageIndex,
        rect: { ...hit.rect },
      },
      printedByPage,
      drawnByPage,
    );
  });

  return dedupeFormFields(synced);
}

function quietField(field: FormField): FormField {
  return {
    ...field,
    placeholder: quietPlaceholder(field.name, field.placeholder, field.type),
  };
}

export function quietPlaceholder(
  name: string,
  current: string | undefined,
  type?: string,
): string | undefined {
  if (type === 'checkbox' || type === 'radio' || type === 'signature') {
    return '';
  }
  const bare = name.replace(/#\d+$/, '');
  if (/^text\d+$/i.test(bare)) return '';
  if (current !== undefined && /^text\d+$/i.test(current.trim())) return '';
  if (/^(undefined|null)$/i.test(bare)) return '';
  if (/\d+$/.test(bare.replace(/\s+/g, ''))) return '';
  if ((current?.length ?? 0) > 18) return '';
  if ((bare.length > 18 || /[_-]/.test(name)) && !current) return '';
  if (current === '') return '';
  return '';
}
