import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import type { FormField, FormFieldRect } from '../document/types.ts';
import { dedupeFormFields } from './SmartFill.ts';

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
  // pdf.js v5+ removed convertToViewportRectangle — map both corners
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

/**
 * Reposition AcroForm fields using pdf.js widget geometry at scale=1.
 * Same transform as the painted page → zoom stays locked to the canvas.
 */
export async function syncFormFieldRectsFromPdfJs(
  doc: PDFDocumentProxy,
  fields: FormField[],
): Promise<FormField[]> {
  if (fields.length === 0) return fields;

  const anns: AnnRect[] = [];
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
  }

  if (anns.length === 0) {
    return dedupeFormFields(fields.map(quietField));
  }

  const usedAnn = new Set<number>();
  const synced = fields.map((field) => {
    const base = normalizeName(field.name);
    let bestIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < anns.length; i++) {
      if (usedAnn.has(i)) continue;
      const a = anns[i]!;
      const an = normalizeName(a.fieldName);
      const exact = an === base;
      const loose =
        exact ||
        base.startsWith(an) ||
        an.startsWith(base) ||
        base.startsWith(`${an}#`) ||
        an.startsWith(`${base}#`);

      let score = 0;
      if (exact) score += 100;
      else if (loose) score += 50;
      else {
        if (a.pageIndex !== field.pageIndex) continue;
        const dist = rectCenterDistance(a.rect, field.rect);
        if (dist > 36) continue;
        score += Math.max(0, 40 - dist);
      }

      if (a.pageIndex === field.pageIndex) score += 20;
      const sizeDelta =
        Math.abs(a.rect.width - field.rect.width) +
        Math.abs(a.rect.height - field.rect.height);
      score -= Math.min(40, sizeDelta / 4);

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx < 0 || bestScore < 25) return quietField(field);
    usedAnn.add(bestIdx);
    const hit = anns[bestIdx]!;
    return quietField({
      ...field,
      pageIndex: hit.pageIndex,
      rect: { ...hit.rect },
    });
  });

  return dedupeFormFields(synced);
}

function quietField(field: FormField): FormField {
  return {
    ...field,
    placeholder: quietPlaceholder(field.name, field.placeholder),
  };
}

export function quietPlaceholder(
  name: string,
  current: string | undefined,
): string | undefined {
  const bare = name.replace(/#\d+$/, '');
  if (/^text\d+$/i.test(bare)) return '';
  if (current !== undefined && /^text\d+$/i.test(current.trim())) return '';
  if (/^(undefined|null)$/i.test(bare)) return '';
  if (current === '') return '';
  return current;
}
