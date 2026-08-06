/**
 * Page organizer — merge / split / reorder.
 * Stubbed for the first release; operations throw until implemented.
 */

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
    degrees: 90 | 180 | 270,
  ): Promise<Uint8Array>;
}

const NOT_IN_V1 = 'Not in first release';

export const pageOrganizer: PageOrganizer = {
  async merge(_documents: OrganizerDocument[]): Promise<Uint8Array> {
    throw new Error(NOT_IN_V1);
  },
  async split(
    _document: OrganizerDocument,
    _ranges: Array<{ start: number; end: number }>,
  ): Promise<Uint8Array[]> {
    throw new Error(NOT_IN_V1);
  },
  async reorder(
    _document: OrganizerDocument,
    _newOrder: number[],
  ): Promise<Uint8Array> {
    throw new Error(NOT_IN_V1);
  },
  async extractPages(
    _document: OrganizerDocument,
    _pageIndexes: number[],
  ): Promise<Uint8Array> {
    throw new Error(NOT_IN_V1);
  },
  async rotatePages(
    _document: OrganizerDocument,
    _pageIndexes: number[],
    _degrees: 90 | 180 | 270,
  ): Promise<Uint8Array> {
    throw new Error(NOT_IN_V1);
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

export async function reorderPages(
  document: OrganizerDocument,
  newOrder: number[],
): Promise<Uint8Array> {
  return pageOrganizer.reorder(document, newOrder);
}
