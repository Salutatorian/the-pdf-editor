import { PDFDocument, degrees, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  deletePages,
  duplicatePage,
  extractPages,
  mergePdfs,
  reorderPages,
  rotatePages,
  splitByRanges,
} from './PageOrganizer.ts';

async function makePdf(
  pageCount: number,
  labelPrefix = 'P',
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([200, 200]);
    page.drawText(`${labelPrefix}${i}`, { x: 20, y: 100, size: 12, font });
  }
  return doc.save();
}

describe('PageOrganizer', () => {
  it('mergePdfs concatenates pages', async () => {
    const a = await makePdf(2, 'A');
    const b = await makePdf(1, 'B');
    const merged = await mergePdfs([a, b]);
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(3);
  });

  it('extractPages keeps requested order', async () => {
    const src = await makePdf(4);
    const out = await extractPages(src, [3, 0, 2]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
  });

  it('splitByRanges returns one PDF per range', async () => {
    const src = await makePdf(5);
    const parts = await splitByRanges(src, [
      { start: 0, end: 1 },
      { start: 2, end: 4 },
    ]);
    expect(parts).toHaveLength(2);
    expect((await PDFDocument.load(parts[0]!)).getPageCount()).toBe(2);
    expect((await PDFDocument.load(parts[1]!)).getPageCount()).toBe(3);
  });

  it('reorderPages permutes pages', async () => {
    const src = await makePdf(3);
    const out = await reorderPages(src, [2, 0, 1]);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  });

  it('rotatePages sets page rotation', async () => {
    const src = await makePdf(2);
    const out = await rotatePages(src, [0], 90);
    const doc = await PDFDocument.load(out);
    expect(doc.getPages()[0]!.getRotation().angle).toBe(90);
    expect(doc.getPages()[1]!.getRotation().angle).toBe(0);
  });

  it('rotatePages stacks on existing rotation', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    page.setRotation(degrees(90));
    doc.addPage([200, 200]);
    const src = await doc.save();
    const out = await rotatePages(src, [0], 90);
    const loaded = await PDFDocument.load(out);
    expect(loaded.getPages()[0]!.getRotation().angle).toBe(180);
  });

  it('deletePages removes selected indexes', async () => {
    const src = await makePdf(4);
    const out = await deletePages(src, [1, 3]);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it('deletePages refuses deleting all pages', async () => {
    const src = await makePdf(2);
    await expect(deletePages(src, [0, 1])).rejects.toThrow(/all pages/i);
  });

  it('duplicatePage inserts a copy after the source', async () => {
    const src = await makePdf(2);
    const out = await duplicatePage(src, 0);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  });

  it('rejects invalid indexes', async () => {
    const src = await makePdf(2);
    await expect(extractPages(src, [5])).rejects.toThrow(/Invalid page index/);
    await expect(reorderPages(src, [0, 0])).rejects.toThrow(/permutation/);
  });
});
