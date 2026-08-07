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
  onZoomChange?: (zoom: number, source?: 'user' | 'fit') => void;
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
        // Use page's own rotate (same as annotation sync) — don't force 0
        const viewport = page.getViewport({ scale: 1 });
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
      onZoomChange?.(resolvedZoom, 'fit');
    }
  }, [resolvedZoom, zoom, zoomMode, onZoomChange]);

  const zoomRef = useRef(resolvedZoom);
  zoomRef.current = resolvedZoom;

  /** Ctrl+wheel zoom, and Ctrl+middle-mouse drag up/down to zoom. */
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !onZoomChange) return;

    const clampZoom = (z: number) => Math.min(5, Math.max(0.1, z));
    const applyFactor = (factor: number) => {
      onZoomChange(clampZoom(zoomRef.current * factor), 'user');
    };

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      const steps = Math.min(3, Math.max(1, Math.abs(e.deltaY) / 100));
      const factor = direction > 0 ? 1.1 ** steps : (1 / 1.1) ** steps;
      applyFactor(factor);
    };

    let dragging = false;
    let lastY = 0;
    let pointerId: number | null = null;

    const onPointerDown = (e: PointerEvent) => {
      // button 1 = middle mouse
      if (e.button !== 1 || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      dragging = true;
      lastY = e.clientY;
      pointerId = e.pointerId;
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dy = lastY - e.clientY;
      lastY = e.clientY;
      if (Math.abs(dy) < 1) return;
      // Drag up → zoom in, drag down → zoom out
      applyFactor(Math.exp(dy * 0.012));
    };

    const endDrag = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (pointerId !== null) {
        try {
          root.releasePointerCapture(pointerId);
        } catch {
          // ignore
        }
      }
      pointerId = null;
      e.preventDefault();
    };

    const onAuxClick = (e: MouseEvent) => {
      // Prevent middle-click autoscroll / open-link while zooming
      if (e.button === 1 && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
      }
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);
    root.addEventListener('auxclick', onAuxClick);

    return () => {
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', endDrag);
      root.removeEventListener('pointercancel', endDrag);
      root.removeEventListener('auxclick', onAuxClick);
    };
  }, [onZoomChange]);

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
