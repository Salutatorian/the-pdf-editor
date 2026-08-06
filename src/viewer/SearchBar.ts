/**
 * Search helpers for TopToolbar ↔ viewer integration.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import type { SearchMatch } from '../document/types.ts';
import { searchInDocument } from './pdfjs.ts';
import { jumpViewerToPage } from './PdfViewer.tsx';

export async function runDocumentSearch(
  doc: PDFDocumentProxy | null,
  query: string,
): Promise<SearchMatch[]> {
  if (!doc || !query.trim()) return [];
  const hits = await searchInDocument(doc, query);
  return hits.map((h) => ({
    pageIndex: h.pageIndex,
    index: h.index,
    text: h.text,
  }));
}

export function jumpToSearchMatch(match: SearchMatch | undefined): void {
  if (!match) return;
  jumpViewerToPage(match.pageIndex);
}

export function nextSearchMatch(
  matches: SearchMatch[],
  current: SearchMatch | null,
): SearchMatch | null {
  if (matches.length === 0) return null;
  if (!current) return matches[0] ?? null;
  const idx = matches.findIndex(
    (m) => m.pageIndex === current.pageIndex && m.index === current.index,
  );
  return matches[(idx + 1) % matches.length] ?? matches[0] ?? null;
}
