import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { PDFPageProxy, TextItem } from 'pdfjs-dist/types/src/display/api';
import { getPageTextContent, renderPageToCanvas } from './pdfjs.ts';

export type PageCanvasProps = {
  page: PDFPageProxy;
  pageIndex: number;
  scale: number;
  rotation: number;
  searchQuery?: string;
  children?: ReactNode;
  className?: string;
  onRendered?: (size: { width: number; height: number }) => void;
};

type TextSpanLayout = {
  key: string;
  str: string;
  left: number;
  top: number;
  fontSize: number;
  width: number;
  height: number;
  fontFamily: string;
  transform: string;
  highlight: boolean;
};

function isTextItem(item: TextItem): item is TextItem & {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
} {
  return 'str' in item && typeof item.str === 'string';
}

export function PageCanvas({
  page,
  pageIndex,
  scale,
  rotation,
  searchQuery = '',
  children,
  className = '',
  onRendered,
}: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cssSize, setCssSize] = useState({ width: 0, height: 0 });
  const [textSpans, setTextSpans] = useState<TextSpanLayout[]>([]);
  const renderGen = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gen = ++renderGen.current;
    let cancelled = false;
    let cancelRender: (() => void) | null = null;

    async function render(): Promise<void> {
      try {
        const handle = renderPageToCanvas(page, canvas!, scale, rotation);
        cancelRender = handle.cancel;
        const size = await handle.promise;
        if (cancelled || gen !== renderGen.current) return;
        setCssSize(size);
        onRendered?.(size);

        const viewport = page.getViewport({ scale, rotation });
        const { items, styles } = await getPageTextContent(page);
        if (cancelled || gen !== renderGen.current) return;

        const query = searchQuery.trim().toLowerCase();
        const spans: TextSpanLayout[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i]!;
          if (!isTextItem(item)) continue;
          const tx = pdfjsTransformToCss(item.transform, viewport);
          const style = styles[item.fontName];
          const fontSize = Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0) * scale;
          const highlight =
            query.length > 0 && item.str.toLowerCase().includes(query);
          spans.push({
            key: `${pageIndex}-${i}`,
            str: item.str,
            left: tx.left,
            top: tx.top,
            fontSize: Math.max(1, fontSize),
            width: item.width * scale,
            height: item.height * scale || fontSize,
            fontFamily: style?.fontFamily ?? 'sans-serif',
            transform: tx.transform,
            highlight,
          });
        }
        setTextSpans(spans);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLowerCase().includes('cancel')) return;
        console.error('PageCanvas render failed', err);
      }
    }

    void render();
    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [page, pageIndex, scale, rotation, searchQuery, onRendered]);

  const style: CSSProperties = {
    width: cssSize.width || undefined,
    height: cssSize.height || undefined,
  };

  return (
    <div
      className={`page-canvas ${className}`.trim()}
      data-page-index={pageIndex}
      style={style}
    >
      <canvas ref={canvasRef} className="page-canvas__pdf" />
      <div className="page-canvas__text-layer" aria-hidden>
        {textSpans.map((span) => (
          <span
            key={span.key}
            className={
              span.highlight
                ? 'page-canvas__text-span page-canvas__text-span--hit'
                : 'page-canvas__text-span'
            }
            style={{
              left: span.left,
              top: span.top,
              fontSize: span.fontSize,
              fontFamily: span.fontFamily,
              transform: span.transform,
              width: span.width,
              height: span.height,
            }}
          >
            {span.str}
          </span>
        ))}
      </div>
      <div className="page-canvas__overlay">{children}</div>
    </div>
  );
}

function pdfjsTransformToCss(
  transform: number[],
  viewport: { convertToViewportPoint: (x: number, y: number) => number[] },
): { left: number; top: number; transform: string } {
  const x = transform[4] ?? 0;
  const y = transform[5] ?? 0;
  const [vx, vy] = viewport.convertToViewportPoint(x, y);
  return {
    left: vx ?? 0,
    top: vy ?? 0,
    transform: 'translateY(-100%)',
  };
}

export type ContinuousPagesProps = {
  pageCount: number;
  currentPage: number;
  onCurrentPageChange: (pageIndex: number) => void;
  renderPage: (pageIndex: number) => ReactNode;
  className?: string;
};

/** Vertical stack of pages with IntersectionObserver current-page tracking. */
export function ContinuousPages({
  pageCount,
  currentPage,
  onCurrentPageChange,
  renderPage,
  className = '',
}: ContinuousPagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const ratiosRef = useRef(new Map<number, number>());

  const attachObserver = useCallback(() => {
    observerRef.current?.disconnect();
    const el = containerRef.current;
    if (!el) return;

    let root: Element | null = el.parentElement;
    while (root) {
      const style = window.getComputedStyle(root);
      if (
        style.overflow === 'auto' ||
        style.overflowY === 'auto' ||
        style.overflow === 'scroll' ||
        style.overflowY === 'scroll'
      ) {
        break;
      }
      root = root.parentElement;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number(
            (entry.target as HTMLElement).dataset.pageIndex ?? -1,
          );
          if (idx < 0) continue;
          ratiosRef.current.set(idx, entry.intersectionRatio);
        }
        let best = currentPage;
        let bestRatio = -1;
        for (const [idx, ratio] of ratiosRef.current) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = idx;
          }
        }
        if (bestRatio > 0 && best !== currentPage) {
          onCurrentPageChange(best);
        }
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    el.querySelectorAll<HTMLElement>('[data-page-index]').forEach((node) =>
      observerRef.current?.observe(node),
    );
  }, [currentPage, onCurrentPageChange]);

  useEffect(() => {
    attachObserver();
    return () => observerRef.current?.disconnect();
  }, [attachObserver, pageCount]);

  return (
    <div
      ref={containerRef}
      className={`pdf-scroll ${className}`.trim()}
      data-testid="pdf-scroll"
    >
      {Array.from({ length: pageCount }, (_, i) => (
        <div key={i} className="pdf-scroll__page" data-page-index={i}>
          {renderPage(i)}
        </div>
      ))}
    </div>
  );
}

export function computeFitWidthScale(
  pageWidth: number,
  containerWidth: number,
  padding = 48,
): number {
  if (pageWidth <= 0 || containerWidth <= 0) return 1;
  return Math.max(0.1, (containerWidth - padding) / pageWidth);
}

export function computeFitPageScale(
  pageWidth: number,
  pageHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding = 48,
): number {
  if (pageWidth <= 0 || pageHeight <= 0) return 1;
  const availW = Math.max(1, containerWidth - padding);
  const availH = Math.max(1, containerHeight - padding);
  return Math.max(0.1, Math.min(availW / pageWidth, availH / pageHeight));
}
