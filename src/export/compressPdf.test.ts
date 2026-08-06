import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { compressPdf } from './compressPdf.ts';

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 400]);
  page.drawText('Compress me', { x: 40, y: 200, size: 18, font });
  return doc.save({ useObjectStreams: false });
}

describe('compressPdf', () => {
  it('returns before/after size fields and valid bytes', async () => {
    const src = await makePdf();
    const result = await compressPdf(src);
    expect(result.before).toBe(src.byteLength);
    expect(typeof result.after).toBe('number');
    expect(result.after).toBeGreaterThan(0);
    expect(result.bytes.byteLength).toBe(result.after);
    const header = String.fromCharCode(
      result.bytes[0]!,
      result.bytes[1]!,
      result.bytes[2]!,
      result.bytes[3]!,
    );
    expect(header).toBe('%PDF');
  });
});
