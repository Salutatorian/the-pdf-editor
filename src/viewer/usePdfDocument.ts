import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import { getHeldDocumentBytes } from '../document/documentBytesHolder.ts';
import { loadPdfDocument, renderPageToCanvas } from './pdfjs.ts';

export type UsePdfDocumentResult = {
  doc: PDFDocumentProxy | null;
  pageCount: number;
  loading: boolean;
  error: string | null;
  getPage: (pageIndex: number) => Promise<PDFPageProxy | null>;
  renderThumbnail: (pageIndex: number, scale?: number) => Promise<string | null>;
};

/**
 * @param documentGen - bumps on every open/replace so we reload even when
 *   byteLength is unchanged (critical for Recent → reopen).
 */
export function usePdfDocument(documentGen: number): UsePdfDocumentResult {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const thumbCache = useRef(new Map<number, string>());

  useEffect(() => {
    let cancelled = false;
    const previous = docRef.current;
    const bytes = getHeldDocumentBytes();

    async function load(): Promise<void> {
      thumbCache.current.clear();
      if (previous) {
        docRef.current = null;
        // Don't await forever — cleanup can hang and freeze Open on Windows
        void Promise.race([
          previous.cleanup().catch(() => undefined),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, 400);
          }),
        ]);
      }

      if (!bytes || bytes.byteLength < 5) {
        if (!cancelled) {
          setDoc(null);
          setPageCount(0);
          setLoading(false);
          setError(bytes ? 'PDF file is empty or unreadable' : null);
        }
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const loaded = await loadPdfDocument(bytes);
        if (cancelled) {
          void loaded.cleanup().catch(() => undefined);
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
  }, [documentGen]);

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
    async (pageIndex: number, scale = 0.85): Promise<string | null> => {
      const cached = thumbCache.current.get(pageIndex);
      if (cached) return cached;
      const page = await getPage(pageIndex);
      if (!page) return null;
      // Target ~2× sidebar width so CSS upscaling doesn't blur
      const canvas = document.createElement('canvas');
      await renderPageToCanvas(page, canvas, scale, 0).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
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
