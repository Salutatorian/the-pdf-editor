import * as pdfjs from 'pdfjs-dist';
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  TextItem,
} from 'pdfjs-dist/types/src/display/api';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export { pdfjs };

export type SearchHit = {
  pageIndex: number;
  index: number;
  text: string;
  itemIndex: number;
};

export async function loadPdfDocument(
  bytes: Uint8Array,
): Promise<PDFDocumentProxy> {
  // pdf.js mutates the buffer in some paths — copy defensively
  const data = bytes.slice();
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  return loadingTask.promise;
}

export type PageRenderHandle = {
  promise: Promise<{ width: number; height: number }>;
  cancel: () => void;
};

/** Absolute viewport rotation: page rotate + user rotate. */
export function totalPageRotation(
  page: { rotate?: number },
  userRotation: number = 0,
): number {
  const pageRotate = typeof page.rotate === 'number' ? page.rotate : 0;
  return (((pageRotate + userRotation) % 360) + 360) % 360;
}

export function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
  rotation: number = 0,
): PageRenderHandle {
  const viewport = page.getViewport({
    scale,
    rotation: totalPageRotation(page, rotation),
  });
  const cssWidth = Math.floor(viewport.width);
  const cssHeight = Math.floor(viewport.height);
  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssWidth * outputScale);
  canvas.height = Math.floor(cssHeight * outputScale);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  const transform =
    outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

  const task = page.render({
    canvasContext: ctx,
    viewport,
    canvas,
    transform,
  });

  return {
    promise: task.promise.then(() => ({
      width: cssWidth,
      height: cssHeight,
    })),
    cancel: () => {
      try {
        task.cancel();
      } catch {
        // ignore cancel races
      }
    },
  };
}

export async function getPageTextContent(page: PDFPageProxy): Promise<{
  items: TextItem[];
  styles: Record<string, { fontFamily: string; ascent: number; descent: number }>;
}> {
  const content = await page.getTextContent();
  const styles: Record<
    string,
    { fontFamily: string; ascent: number; descent: number }
  > = {};
  for (const [key, style] of Object.entries(content.styles)) {
    styles[key] = {
      fontFamily: style.fontFamily,
      ascent: style.ascent,
      descent: style.descent,
    };
  }
  return { items: content.items as TextItem[], styles };
}

export async function searchInDocument(
  doc: PDFDocumentProxy,
  query: string,
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  const hits: SearchHit[] = [];

  for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex++) {
    const page = await doc.getPage(pageIndex + 1);
    const { items } = await getPageTextContent(page);
    let matchIndex = 0;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex]!;
      if (!('str' in item)) continue;
      const str = item.str;
      const pos = str.toLowerCase().indexOf(lower);
      if (pos < 0) continue;
      hits.push({
        pageIndex,
        index: matchIndex++,
        text: str.slice(pos, pos + trimmed.length),
        itemIndex,
      });
    }
  }

  return hits;
}
