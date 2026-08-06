import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { unlockPdf, protectPdf } from './PdfSecurity.ts';

describe('PdfSecurity', () => {
  it('unlockPdf re-saves a plain PDF', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const bytes = await doc.save();
    const out = await unlockPdf(bytes, 'any');
    expect(out.byteLength).toBeGreaterThan(0);
    const header = String.fromCharCode(out[0]!, out[1]!, out[2]!, out[3]!);
    expect(header).toBe('%PDF');
  });

  it('protectPdf documents missing encrypt API', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const bytes = await doc.save();
    await expect(protectPdf(bytes, 'secret')).rejects.toThrow(/encrypt/i);
  });
});
