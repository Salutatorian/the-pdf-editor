/**
 * Page organizer — merge / split / reorder / rotate / delete / duplicate.
 * Implemented with pdf-lib (no stubs).
 */

import { PDFDocument, degrees, type PDFPage } from 'pdf-lib';

export type PageRef = {
  documentId: string;
  pageIndex: number;
};

export type OrganizerDocument = {
  id: string;
  name: string;
  pageCount: number;
  bytes: Uint8Array;
};

async function loadDoc(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
}

function assertValidIndexes(pageCount: number, indexes: number[]): void {
  for (const i of indexes) {
    if (!Number.isInteger(i) || i < 0 || i >= pageCount) {
      throw new Error(`Invalid page index ${i} (pageCount=${pageCount})`);
    }
  }
}

function uniqueSortedDescending(indexes: number[]): number[] {
  return [...new Set(indexes)].sort((a, b) => b - a);
}

/**
 * Merge multiple PDFs in order into a single document.
 */
export async function mergePdfs(
  pdfBytesList: Uint8Array[],
): Promise<Uint8Array> {
  if (pdfBytesList.length === 0) {
    throw new Error('mergePdfs requires at least one document');
  }
  const out = await PDFDocument.create();
  for (const bytes of pdfBytesList) {
    const src = await loadDoc(bytes);
    const indices = src.getPageIndices();
    const copied = await out.copyPages(src, indices);
    for (const page of copied) {
      out.addPage(page);
    }
  }
  return out.save();
}

/**
 * Extract the given pages (0-based, in the order provided) into a new PDF.
 */
export async function extractPages(
  bytes: Uint8Array,
  pageIndexes: number[],
): Promise<Uint8Array> {
  const src = await loadDoc(bytes);
  assertValidIndexes(src.getPageCount(), pageIndexes);
  if (pageIndexes.length === 0) {
    throw new Error('extractPages requires at least one page index');
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pageIndexes);
  for (const page of copied) {
    out.addPage(page);
  }
  return out.save();
}

/**
 * Split into one PDF per inclusive range `{ start, end }` (0-based).
 */
export async function splitByRanges(
  bytes: Uint8Array,
  ranges: Array<{ start: number; end: number }>,
): Promise<Uint8Array[]> {
  const src = await loadDoc(bytes);
  const pageCount = src.getPageCount();
  const results: Uint8Array[] = [];

  for (const range of ranges) {
    if (
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      range.start < 0 ||
      range.end >= pageCount ||
      range.start > range.end
    ) {
      throw new Error(
        `Invalid range ${range.start}-${range.end} (pageCount=${pageCount})`,
      );
    }
    const indexes: number[] = [];
    for (let i = range.start; i <= range.end; i++) indexes.push(i);
    results.push(await extractPages(bytes, indexes));
  }
  return results;
}

/**
 * Rebuild the PDF with pages in `newOrder` (permutation of 0..n-1).
 */
export async function reorderPages(
  bytes: Uint8Array,
  newOrder: number[],
): Promise<Uint8Array> {
  const src = await loadDoc(bytes);
  const pageCount = src.getPageCount();
  if (newOrder.length !== pageCount) {
    throw new Error(
      `newOrder length ${newOrder.length} must equal pageCount ${pageCount}`,
    );
  }
  assertValidIndexes(pageCount, newOrder);
  if (new Set(newOrder).size !== pageCount) {
    throw new Error('newOrder must be a permutation of page indexes');
  }
  return extractPages(bytes, newOrder);
}

function addRotation(page: PDFPage, degreesValue: 90 | 180 | 270): void {
  const current = page.getRotation().angle;
  const next = ((current + degreesValue) % 360) as 0 | 90 | 180 | 270;
  page.setRotation(degrees(next));
}

/**
 * Rotate selected pages by 90, 180, or 270 degrees (clockwise).
 */
export async function rotatePages(
  bytes: Uint8Array,
  pageIndexes: number[],
  rotationDegrees: 90 | 180 | 270,
): Promise<Uint8Array> {
  const doc = await loadDoc(bytes);
  assertValidIndexes(doc.getPageCount(), pageIndexes);
  const pages = doc.getPages();
  for (const i of new Set(pageIndexes)) {
    addRotation(pages[i]!, rotationDegrees);
  }
  return doc.save();
}

/**
 * Delete pages by index. Remaining pages keep relative order.
 */
export async function deletePages(
  bytes: Uint8Array,
  pageIndexesToRemove: number[],
): Promise<Uint8Array> {
  const src = await loadDoc(bytes);
  const pageCount = src.getPageCount();
  assertValidIndexes(pageCount, pageIndexesToRemove);
  const remove = new Set(pageIndexesToRemove);
  if (remove.size >= pageCount) {
    throw new Error('Cannot delete all pages');
  }
  const keep = src.getPageIndices().filter((i) => !remove.has(i));
  return extractPages(bytes, keep);
}

/**
 * Duplicate a page immediately after itself.
 */
export async function duplicatePage(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<Uint8Array> {
  const src = await loadDoc(bytes);
  assertValidIndexes(src.getPageCount(), [pageIndex]);
  const order = src.getPageIndices();
  const next: number[] = [];
  for (const i of order) {
    next.push(i);
    if (i === pageIndex) next.push(i);
  }
  return extractPages(bytes, next);
}

/** Object-style organizer for callers that prefer OrganizerDocument. */
export interface PageOrganizer {
  merge(documents: OrganizerDocument[]): Promise<Uint8Array>;
  split(
    document: OrganizerDocument,
    ranges: Array<{ start: number; end: number }>,
  ): Promise<Uint8Array[]>;
  reorder(
    document: OrganizerDocument,
    newOrder: number[],
  ): Promise<Uint8Array>;
  extractPages(
    document: OrganizerDocument,
    pageIndexes: number[],
  ): Promise<Uint8Array>;
  rotatePages(
    document: OrganizerDocument,
    pageIndexes: number[],
    rotationDegrees: 90 | 180 | 270,
  ): Promise<Uint8Array>;
  deletePages(
    document: OrganizerDocument,
    pageIndexesToRemove: number[],
  ): Promise<Uint8Array>;
  duplicatePage(
    document: OrganizerDocument,
    pageIndex: number,
  ): Promise<Uint8Array>;
}

export const pageOrganizer: PageOrganizer = {
  async merge(documents) {
    return mergePdfs(documents.map((d) => d.bytes));
  },
  async split(document, ranges) {
    return splitByRanges(document.bytes, ranges);
  },
  async reorder(document, newOrder) {
    return reorderPages(document.bytes, newOrder);
  },
  async extractPages(document, pageIndexes) {
    return extractPages(document.bytes, pageIndexes);
  },
  async rotatePages(document, pageIndexes, rotationDegrees) {
    return rotatePages(document.bytes, pageIndexes, rotationDegrees);
  },
  async deletePages(document, pageIndexesToRemove) {
    return deletePages(document.bytes, pageIndexesToRemove);
  },
  async duplicatePage(document, pageIndex) {
    return duplicatePage(document.bytes, pageIndex);
  },
};

export async function mergeDocuments(
  documents: OrganizerDocument[],
): Promise<Uint8Array> {
  return pageOrganizer.merge(documents);
}

export async function splitDocument(
  document: OrganizerDocument,
  ranges: Array<{ start: number; end: number }>,
): Promise<Uint8Array[]> {
  return pageOrganizer.split(document, ranges);
}

/** @deprecated Prefer uniqueSortedDescending usage inside deletePages — kept for tests. */
export function _uniqueSortedDescending(indexes: number[]): number[] {
  return uniqueSortedDescending(indexes);
}
