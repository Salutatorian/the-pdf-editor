import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import type { FormFieldRect } from '../document/types.ts';

/** Subset of pdf.js OPS — avoid importing pdfjs-dist at module load (breaks Node tests). */
const OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  rectangle: 19,
  constructPath: 91,
} as const;

type Ctm = [number, number, number, number, number, number];

const IDENTITY: Ctm = [1, 0, 0, 1, 0, 0];

function multiply(a: Ctm, b: Ctm): Ctm {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function apply(ctm: Ctm, x: number, y: number): { x: number; y: number } {
  return {
    x: ctm[0] * x + ctm[2] * y + ctm[4],
    y: ctm[1] * x + ctm[3] * y + ctm[5],
  };
}

/** Axis-aligned page-space rect (PDF bottom-left → top-left y). */
function pdfBoxToPageRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ctm: Ctm,
  pageHeight: number,
): FormFieldRect {
  const corners = [
    apply(ctm, x0, y0),
    apply(ctm, x1, y0),
    apply(ctm, x0, y1),
    apply(ctm, x1, y1),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: pageHeight - maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

type PagePoint = { x: number; y: number };
type Segment = { x1: number; y1: number; x2: number; y2: number };

function toPagePoint(ctm: Ctm, x: number, y: number, pageHeight: number): PagePoint {
  const p = apply(ctm, x, y);
  return { x: p.x, y: pageHeight - p.y };
}

/**
 * Parse a pdf.js constructPath Float32 buffer into axis-aligned rects + H/V segments.
 * Buffer layout: DrawOPS interleaved with coords (moveTo/lineTo/closePath).
 */
export function geometryFromPathBuffer(
  data: ArrayLike<number>,
  ctm: Ctm,
  pageHeight: number,
): { rects: FormFieldRect[]; segments: Segment[] } {
  const DrawOPS = { moveTo: 0, lineTo: 1, closePath: 4 };
  const rects: FormFieldRect[] = [];
  const segments: Segment[] = [];
  let i = 0;
  let startX = 0;
  let startY = 0;
  let curX = 0;
  let curY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let points = 0;
  let closed = false;

  const reset = () => {
    minX = Infinity;
    minY = Infinity;
    maxX = -Infinity;
    maxY = -Infinity;
    points = 0;
    closed = false;
  };

  const addPoint = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    points += 1;
  };

  const pushSeg = (x0: number, y0: number, x1: number, y1: number) => {
    const a = toPagePoint(ctm, x0, y0, pageHeight);
    const b = toPagePoint(ctm, x1, y1, pageHeight);
    segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  };

  const flushRect = () => {
    if (points < 3 || !closed) {
      reset();
      return;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    // Only closed, roughly rectangular paths (not whole polylines)
    if (w >= 1 && h >= 1 && points <= 6) {
      rects.push(pdfBoxToPageRect(minX, minY, maxX, maxY, ctm, pageHeight));
    }
    reset();
  };

  while (i < data.length) {
    const op = data[i++]!;
    if (op === DrawOPS.moveTo) {
      if (points >= 3) flushRect();
      startX = curX = data[i++]!;
      startY = curY = data[i++]!;
      addPoint(curX, curY);
      continue;
    }
    if (op === DrawOPS.lineTo) {
      const nx = data[i++]!;
      const ny = data[i++]!;
      pushSeg(curX, curY, nx, ny);
      curX = nx;
      curY = ny;
      addPoint(curX, curY);
      continue;
    }
    if (op === DrawOPS.closePath) {
      if (points > 0) {
        pushSeg(curX, curY, startX, startY);
        addPoint(startX, startY);
      }
      closed = true;
      flushRect();
      continue;
    }
    if (op === 2) {
      i += 6;
      reset();
      continue;
    }
    if (op === 3) {
      i += 4;
      reset();
      continue;
    }
    break;
  }
  if (points >= 3 && closed) flushRect();
  return { rects, segments };
}

/** @deprecated use geometryFromPathBuffer */
export function rectsFromPathBuffer(
  data: ArrayLike<number>,
  ctm: Ctm,
  pageHeight: number,
): FormFieldRect[] {
  return geometryFromPathBuffer(data, ctm, pageHeight).rects;
}

export type DrawnBoxKind = 'checkbox' | 'text';

export type DrawnBox = FormFieldRect & { kind: DrawnBoxKind };

function area(r: FormFieldRect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

/** True when `inner` lies mostly inside `outer`. */
export function mostlyInside(
  inner: FormFieldRect,
  outer: FormFieldRect,
  frac = 0.7,
): boolean {
  const overlapW = Math.max(
    0,
    Math.min(inner.x + inner.width, outer.x + outer.width) -
      Math.max(inner.x, outer.x),
  );
  const overlapH = Math.max(
    0,
    Math.min(inner.y + inner.height, outer.y + outer.height) -
      Math.max(inner.y, outer.y),
  );
  const overlap = overlapW * overlapH;
  return overlap >= area(inner) * frac;
}

function classifyRect(
  rect: FormFieldRect,
  pageWidth: number,
  pageHeight: number,
): DrawnBoxKind | null {
  const { width: w, height: h } = rect;
  if (w < 4 || h < 4) return null;
  // Reject section / multi-column frames
  if (w > pageWidth * 0.55) return null;
  if (h > Math.min(140, pageHeight * 0.18)) return null;
  if (w * h > pageWidth * pageHeight * 0.08) return null;

  const maxSide = Math.max(w, h);
  const minSide = Math.min(w, h);
  const aspect = minSide / maxSide;

  if (maxSide <= 28 && aspect >= 0.55) return 'checkbox';
  if (maxSide <= 36 && aspect >= 0.7 && w * h <= 900) return 'checkbox';

  // Tight table cells / short blanks only
  if (h >= 8 && h <= 36 && w >= 18 && w <= pageWidth * 0.48) return 'text';
  if (h > 36 && h <= 90 && w >= 30 && w <= pageWidth * 0.42) return 'text';
  return null;
}

function nearlySame(a: FormFieldRect, b: FormFieldRect): boolean {
  return (
    Math.abs(a.x - b.x) < 2 &&
    Math.abs(a.y - b.y) < 2 &&
    Math.abs(a.width - b.width) < 3 &&
    Math.abs(a.height - b.height) < 3
  );
}

export function clusterCoords(values: number[], tol = 2.5): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || Math.abs(out[out.length - 1]! - v) > tol) {
      out.push(v);
    } else {
      const last = out[out.length - 1]!;
      out[out.length - 1] = (last + v) / 2;
    }
  }
  return out;
}

/**
 * Build table cells from ruled H/V lines (employment apps draw grids as strokes).
 */
export function cellsFromLineGrid(
  segments: Segment[],
  pageWidth: number,
  pageHeight: number,
): FormFieldRect[] {
  const horiz: Segment[] = [];
  const vert: Segment[] = [];
  for (const s of segments) {
    const dx = Math.abs(s.x2 - s.x1);
    const dy = Math.abs(s.y2 - s.y1);
    if (dx >= 8 && dy <= 1.8) {
      horiz.push({
        x1: Math.min(s.x1, s.x2),
        x2: Math.max(s.x1, s.x2),
        y1: (s.y1 + s.y2) / 2,
        y2: (s.y1 + s.y2) / 2,
      });
    } else if (dy >= 8 && dx <= 1.8) {
      vert.push({
        y1: Math.min(s.y1, s.y2),
        y2: Math.max(s.y1, s.y2),
        x1: (s.x1 + s.x2) / 2,
        x2: (s.x1 + s.x2) / 2,
      });
    }
  }
  if (horiz.length < 2 || vert.length < 2) return [];

  const ys = clusterCoords(horiz.map((h) => h.y1));
  const xs = clusterCoords(vert.map((v) => v.x1));
  if (xs.length < 2 || ys.length < 2) return [];

  const lineNearH = (y: number, x0: number, x1: number) =>
    horiz.some(
      (h) =>
        Math.abs(h.y1 - y) <= 2.5 &&
        h.x1 <= x0 + 4 &&
        h.x2 >= x1 - 4,
    );
  const lineNearV = (x: number, y0: number, y1: number) =>
    vert.some(
      (v) =>
        Math.abs(v.x1 - x) <= 2.5 &&
        v.y1 <= y0 + 4 &&
        v.y2 >= y1 - 4,
    );

  const cells: FormFieldRect[] = [];
  for (let yi = 0; yi < ys.length - 1; yi++) {
    const y0 = ys[yi]!;
    const y1 = ys[yi + 1]!;
    const h = y1 - y0;
    if (h < 8 || h > 100) continue;
    for (let xi = 0; xi < xs.length - 1; xi++) {
      const x0 = xs[xi]!;
      const x1 = xs[xi + 1]!;
      const w = x1 - x0;
      if (w < 10 || w > pageWidth * 0.5) continue;
      // Require the four bordering strokes so we don't invent fake cells
      if (
        !lineNearH(y0, x0, x1) ||
        !lineNearH(y1, x0, x1) ||
        !lineNearV(x0, y0, y1) ||
        !lineNearV(x1, y0, y1)
      ) {
        continue;
      }
      if (w > pageWidth * 0.55) continue;
      if (w * h > pageWidth * pageHeight * 0.08) continue;
      cells.push({ x: x0, y: y0, width: w, height: h });
    }
  }
  return cells;
}

/**
 * Drop parent frames that contain smaller cells, and overlapping siblings
 * where the larger box would overfill the form.
 */
export function pruneDrawnBoxes(boxes: DrawnBox[]): DrawnBox[] {
  const unique: DrawnBox[] = [];
  for (const b of boxes) {
    if (unique.some((u) => nearlySame(u, b))) continue;
    unique.push(b);
  }

  const leaves = unique.filter((a) => {
    if (a.kind === 'checkbox') return true;
    return !unique.some(
      (b) =>
        b !== a &&
        area(b) < area(a) * 0.92 &&
        mostlyInside(b, a, 0.6),
    );
  });

  const sorted = [...leaves].sort((a, b) => area(a) - area(b));
  const kept: DrawnBox[] = [];
  for (const b of sorted) {
    const clashes = kept.some((k) => {
      if (k.kind === 'checkbox' && b.kind === 'checkbox') {
        const dx = k.x + k.width / 2 - (b.x + b.width / 2);
        const dy = k.y + k.height / 2 - (b.y + b.height / 2);
        return Math.hypot(dx, dy) < 10;
      }
      if (k.kind === 'checkbox' || b.kind === 'checkbox') {
        const check = k.kind === 'checkbox' ? k : b;
        const text = k.kind === 'checkbox' ? b : k;
        return mostlyInside(check, text, 0.45);
      }
      const overlapW = Math.max(
        0,
        Math.min(k.x + k.width, b.x + b.width) - Math.max(k.x, b.x),
      );
      const overlapH = Math.max(
        0,
        Math.min(k.y + k.height, b.y + b.height) - Math.max(k.y, b.y),
      );
      if (overlapW * overlapH <= 0) return false;
      // Any meaningful horizontal overlap on the same band = clash
      return (
        overlapW >= 4 &&
        overlapH >= Math.min(k.height, b.height) * 0.35
      );
    });
    if (clashes) continue;
    kept.push(b);
  }

  return kept.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'checkbox' ? -1 : 1;
    return a.y - b.y || a.x - b.x;
  });
}

/**
 * Walk the page operator list and collect stroked/filled axis-aligned boxes.
 */
export async function detectDrawnBoxes(
  page: PDFPageProxy,
  pageWidth: number,
  pageHeight: number,
): Promise<DrawnBox[]> {
  const ops = await page.getOperatorList();
  const fnArray = ops.fnArray as number[];
  const argsArray = ops.argsArray as unknown[];

  const stack: Ctm[] = [];
  let ctm: Ctm = [...IDENTITY];
  const found: FormFieldRect[] = [];
  const allSegments: Segment[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]!;
    const args = argsArray[i] as unknown;

    if (fn === OPS.save) {
      stack.push(ctm);
      continue;
    }
    if (fn === OPS.restore) {
      ctm = stack.pop() ?? [...IDENTITY];
      continue;
    }
    if (fn === OPS.transform) {
      const m = args as number[];
      if (m?.length >= 6) {
        ctm = multiply(ctm, [m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!]);
      }
      continue;
    }
    if (fn === OPS.rectangle) {
      const a = args as number[];
      if (!a || a.length < 4) continue;
      const x = a[0]!;
      const y = a[1]!;
      const w = a[2]!;
      const h = a[3]!;
      found.push(pdfBoxToPageRect(x, y, x + w, y + h, ctm, pageHeight));
      continue;
    }
    if (fn === OPS.constructPath) {
      const a = args as unknown[];
      if (!Array.isArray(a) || a.length < 2) continue;
      const pathSlot = a[1];
      const data =
        Array.isArray(pathSlot) && pathSlot[0]
          ? (pathSlot[0] as ArrayLike<number>)
          : null;
      if (data && data.length > 0) {
        const geo = geometryFromPathBuffer(data, ctm, pageHeight);
        found.push(...geo.rects);
        allSegments.push(...geo.segments);
      }
      // Intentionally ignore minMax-only paths — those are often whole tables.
    }
  }

  found.push(...cellsFromLineGrid(allSegments, pageWidth, pageHeight));

  const classified: DrawnBox[] = [];
  for (const rect of found) {
    const kind = classifyRect(rect, pageWidth, pageHeight);
    if (!kind) continue;
    if (classified.some((c) => nearlySame(c, rect))) continue;
    classified.push({ ...rect, kind });
  }

  return pruneDrawnBoxes(classified);
}
