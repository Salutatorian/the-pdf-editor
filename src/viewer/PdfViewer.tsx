import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import type {
  OverlayObject,
  PageRotation,
  ZoomMode,
} from '../document/types.ts';
import {
  ContinuousPages,
  PageCanvas,
  computeFitPageScale,
  computeFitWidthScale,
} from './PageCanvas.tsx';

export type PdfViewerProps = {
  doc: PDFDocumentProxy | null;
  pageCount: number;
  currentPage: number;
  onPageChange: (pageIndex: number) => void;
  zoom: number;
  zoomMode: ZoomMode;
  onZoomChange?: (zoom: number) => void;
  rotation: PageRotation;
  searchQuery?: string;
  getPage: (pageIndex: number) => Promise<PDFPageProxy | null>;
  renderOverlay?: (args: {
    pageIndex: number;
    scale: number;
    pageWidth: number;
    pageHeight: number;
  }) => ReactNode;
};

type PageEntry = {
  page: PDFPageProxy;
  baseWidth: number;
  baseHeight: number;
};

export function PdfViewer({
  doc,
  pageCount,
  currentPage,
  onPageChange,
  zoom,
  zoomMode,
  onZoomChange,
  rotation,
  searchQuery = '',
  getPage,
  renderOverlay,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Map<number, PageEntry>>(new Map());
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    ro.observe(el);
    setContainerSize({
      width: el.clientWidth,
      height: el.clientHeight,
    });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPages(): Promise<void> {
      if (!doc || pageCount === 0) {
        setPages(new Map());
        return;
      }
      const next = new Map<number, PageEntry>();
      for (let i = 0; i < pageCount; i++) {
        const page = await getPage(i);
        if (!page || cancelled) return;
        const viewport = page.getViewport({ scale: 1, rotation: 0 });
        next.set(i, {
          page,
          baseWidth: viewport.width,
          baseHeight: viewport.height,
        });
      }
      if (!cancelled) setPages(next);
    }
    void loadPages();
    return () => {
      cancelled = true;
    };
  }, [doc, pageCount, getPage]);

  const firstPage = pages.get(0);
  const resolvedZoom = useMemo(() => {
    if (!firstPage || containerSize.width <= 0) return zoom;
    if (zoomMode === 'fit-width') {
      return computeFitWidthScale(firstPage.baseWidth, containerSize.width);
    }
    if (zoomMode === 'fit-page') {
      return computeFitPageScale(
        firstPage.baseWidth,
        firstPage.baseHeight,
        containerSize.width,
        containerSize.height,
      );
    }
    return zoom;
  }, [firstPage, containerSize, zoom, zoomMode]);

  useEffect(() => {
    if (zoomMode === 'custom') return;
    if (Math.abs(resolvedZoom - zoom) > 0.001) {
      onZoomChange?.(resolvedZoom);
    }
  }, [resolvedZoom, zoom, zoomMode, onZoomChange]);

  const scrollToPage = useCallback((pageIndex: number) => {
    const root = containerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(
      `[data-page-index="${pageIndex}"]`,
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Expose jump for search via data attribute listener from parent
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ pageIndex: number }>).detail;
      if (detail && typeof detail.pageIndex === 'number') {
        scrollToPage(detail.pageIndex);
      }
    };
    root.addEventListener('pdf_editor:jump-page', handler);
    return () => root.removeEventListener('pdf_editor:jump-page', handler);
  }, [scrollToPage]);

  if (!doc) {
    return (
      <div className="pdf-viewer pdf-viewer--empty" ref={containerRef}>
        <p>No document loaded</p>
      </div>
    );
  }

  return (
    <div className="pdf-viewer" ref={containerRef} data-testid="pdf-viewer">
      <ContinuousPages
        pageCount={pageCount}
        currentPage={currentPage}
        onCurrentPageChange={onPageChange}
        renderPage={(pageIndex) => {
          const entry = pages.get(pageIndex);
          if (!entry) {
            return (
              <div className="page-canvas page-canvas--loading">
                Loading page {pageIndex + 1}…
              </div>
            );
          }
          return (
            <PageCanvas
              page={entry.page}
              pageIndex={pageIndex}
              scale={resolvedZoom}
              rotation={rotation}
              searchQuery={searchQuery}
            >
              {renderOverlay?.({
                pageIndex,
                scale: resolvedZoom,
                pageWidth: entry.baseWidth,
                pageHeight: entry.baseHeight,
              })}
            </PageCanvas>
          );
        }}
      />
    </div>
  );
}

export function overlaysForPage(
  overlays: OverlayObject[],
  pageIndex: number,
): OverlayObject[] {
  return overlays.filter((o) => o.pageIndex === pageIndex);
}

export function jumpViewerToPage(pageIndex: number): void {
  const viewer = document.querySelector('[data-testid="pdf-viewer"]');
  if (!viewer) return;
  viewer.dispatchEvent(
    new CustomEvent('pdf_editor:jump-page', { detail: { pageIndex } }),
  );
}
