import Tesseract from 'tesseract.js';
import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import { renderPageToCanvas } from '../viewer/pdfjs.ts';

export type OcrTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

export interface OcrResult {
  textItems: OcrTextItem[];
  deskewAngle?: number;
}

export type OcrOptions = {
  /**
   * When true, attempt a simple skew estimate via Tesseract OSD.
   * If OSD is unavailable or fails, OCR still runs without deskew
   * (deskewAngle omitted). Full affine deskew of the bitmap is not applied.
   */
  deskew?: boolean;
};

let availabilityCache: boolean | null = null;

/**
 * Returns true when tesseract.js can be loaded/used in this environment.
 */
export function isOcrAvailable(): boolean {
  if (availabilityCache !== null) return availabilityCache;
  try {
    availabilityCache = typeof Tesseract?.recognize === 'function';
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

/**
 * Render a PDF.js page to ImageData via an offscreen canvas.
 */
export async function renderPageToImageData(
  page: PDFPageProxy,
  scale = 2,
): Promise<{ imageData: ImageData; width: number; height: number }> {
  const canvas = document.createElement('canvas');
  const { width, height } = await renderPageToCanvas(page, canvas, scale, 0);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { imageData, width, height };
}

function wordsToTextItems(
  words: Array<{
    text: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>,
  pageHeight: number,
  scaleX: number,
  scaleY: number,
): OcrTextItem[] {
  const items: OcrTextItem[] = [];
  for (const word of words) {
    const str = word.text?.trim();
    if (!str) continue;
    const x0 = word.bbox.x0 * scaleX;
    const y0 = word.bbox.y0 * scaleY;
    const x1 = word.bbox.x1 * scaleX;
    const y1 = word.bbox.y1 * scaleY;
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);
    // PDF.js-like transform: e,f are baseline x,y from bottom-left
    const baselineY = pageHeight - y1;
    items.push({
      str,
      transform: [1, 0, 0, 1, x0, baselineY],
      width,
      height,
    });
  }
  return items;
}

/**
 * Run OCR on page ImageData. Never mutates the PDF — returns text items only.
 */
export async function runOcr(
  pageImage: ImageData,
  opts?: OcrOptions,
): Promise<OcrResult> {
  if (!isOcrAvailable()) {
    throw new Error(
      'OCR not configured in this build — enable optional OCR pack (tesseract.js)',
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = pageImage.width;
  canvas.height = pageImage.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.putImageData(pageImage, 0, 0);

  let deskewAngle: number | undefined;
  if (opts?.deskew) {
    // OSD-based skew estimate; skip silently if unavailable.
    try {
      const osd = await Tesseract.detect(canvas);
      const angle = osd?.data?.orientation_degrees;
      if (typeof angle === 'number' && angle !== 0) {
        deskewAngle = angle;
        // Note: we do not rotate the bitmap here; callers may use deskewAngle.
      }
    } catch {
      // Deskew optional — continue with OCR.
    }
  }

  const result = await Tesseract.recognize(canvas, 'eng');
  const words: Array<{
    text: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }> = [];
  for (const block of result.data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          words.push({ text: word.text, bbox: word.bbox });
        }
      }
    }
  }

  const textItems = wordsToTextItems(
    words,
    pageImage.height,
    1,
    1,
  );

  return { textItems, deskewAngle };
}
