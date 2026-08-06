import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { OverlayObject } from '../src/document/types.ts';
import {
  buildPdfWithEdits,
  verifyExport,
} from '../src/export/SavePipeline.ts';
import { createBrowserSaveIO } from '../src/persistence/tauriSaveIO.ts';
import { verifiedSave } from '../src/export/SavePipeline.ts';

async function makeMinimalPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Hello', { x: 50, y: 700, size: 12, font });
  return doc.save();
}

describe('e2e save pipeline (unit)', () => {
  it('buildPdfWithEdits + verifyExport round-trips', async () => {
    const original = await makeMinimalPdf();
    const overlays: OverlayObject[] = [
      {
        id: 't1',
        pageIndex: 0,
        kind: 'text',
        x: 72,
        y: 120,
        width: 140,
        height: 24,
        rotation: 0,
        zIndex: 1,
        text: 'Annotated',
        fontSize: 14,
        color: '#000000',
      },
    ];

    const built = await buildPdfWithEdits(original, overlays, []);
    await verifyExport(built);

    const reopen = await PDFDocument.load(built);
    expect(reopen.getPageCount()).toBe(1);
  });

  it('verifiedSave succeeds with browser SaveIO', async () => {
    const original = await makeMinimalPdf();
    const downloads = new Map<string, Uint8Array>();
    downloads.set('sample.pdf', original);
    const io = createBrowserSaveIO({ downloads });

    const result = await verifiedSave({
      originalPath: 'sample.pdf',
      originalBytes: original,
      overlays: [],
      formFields: [],
      io,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.verified).toBe(true);
      expect(result.fileSize).toBeGreaterThan(0);
    }
    const saved = downloads.get('sample.pdf');
    expect(saved).toBeTruthy();
    if (saved) {
      await verifyExport(saved);
    }
  });
});
