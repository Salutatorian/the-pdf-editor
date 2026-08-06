import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import { loadPdfDocument, renderPageToCanvas } from './pdfjs.ts';

export type UsePdfDocumentResult = {
  doc: PDFDocumentProxy | null;
  pageCount: number;
  loading: boolean;
  error: string | null;
  getPage: (pageIndex: number) => Promise<PDFPageProxy | null>;
  renderThumbnail: (pageIndex: number, scale?: number) => Promise<string | null>;
};

export function usePdfDocument(bytes: Uint8Array | null): UsePdfDocumentResult {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const thumbCache = useRef(new Map<number, string>());

  useEffect(() => {
    let cancelled = false;
    const previous = docRef.current;

    async function load(): Promise<void> {
      thumbCache.current.clear();
      if (previous) {
        try {
          await previous.cleanup();
        } catch {
          // ignore cleanup errors
        }
        docRef.current = null;
      }

      if (!bytes) {
        if (!cancelled) {
          setDoc(null);
          setPageCount(0);
          setLoading(false);
          setError(null);
        }
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const loaded = await loadPdfDocument(bytes);
        if (cancelled) {
          await loaded.cleanup();
          return;
        }
        docRef.current = loaded;
        setDoc(loaded);
        setPageCount(loaded.numPages);
      } catch (err) {
        if (!cancelled) {
          setDoc(null);
          setPageCount(0);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [bytes]);

  useEffect(() => {
    return () => {
      const current = docRef.current;
      if (current) {
        void current.cleanup();
        docRef.current = null;
      }
    };
  }, []);

  const getPage = useCallback(
    async (pageIndex: number): Promise<PDFPageProxy | null> => {
      const current = docRef.current;
      if (!current) return null;
      if (pageIndex < 0 || pageIndex >= current.numPages) return null;
      return current.getPage(pageIndex + 1);
    },
    [],
  );

  const renderThumbnail = useCallback(
    async (pageIndex: number, scale = 0.2): Promise<string | null> => {
      const cached = thumbCache.current.get(pageIndex);
      if (cached) return cached;
      const page = await getPage(pageIndex);
      if (!page) return null;
      const canvas = document.createElement('canvas');
      await renderPageToCanvas(page, canvas, scale, 0);
      const dataUrl = canvas.toDataURL('image/png');
      thumbCache.current.set(pageIndex, dataUrl);
      return dataUrl;
    },
    [getPage],
  );

  return {
    doc,
    pageCount,
    loading,
    error,
    getPage,
    renderThumbnail,
  };
}
