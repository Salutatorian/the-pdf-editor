import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it, vi } from 'vitest';
import type { FormField, OverlayObject } from '../document/types.ts';
import {
  saveAs,
  verifiedSave,
  type SaveIO,
  type SaveResult,
} from './SavePipeline.ts';

const require = createRequire(import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href;

async function extractPageText(bytes: Uint8Array): Promise<string> {
  const doc = await pdfjs
    .getDocument({ data: bytes.slice(), useSystemFonts: true })
    .promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ');
}

async function makeMinimalPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Hello', { x: 50, y: 700, size: 12, font });
  return doc.save();
}

function createMockIo(options?: {
  failOnReopenTemp?: boolean;
  failOnReplace?: boolean;
}): {
  io: SaveIO;
  calls: string[];
  files: Map<string, Uint8Array>;
} {
  const calls: string[] = [];
  const files = new Map<string, Uint8Array>();

  const io: SaveIO = {
    async writeTemp(besidePath, bytes) {
      calls.push('writeTemp');
      const temp = `${besidePath}.tmp`;
      files.set(temp, bytes);
      return temp;
    },
    async readFile(path) {
      calls.push(`readFile:${path}`);
      const data = files.get(path);
      if (!data) throw new Error(`missing file ${path}`);
      return data;
    },
    async replaceAtomic(originalPath, tempPath) {
      calls.push('replaceAtomic');
      if (options?.failOnReplace) {
        throw new Error('replace failed');
      }
      const temp = files.get(tempPath);
      if (!temp) throw new Error('temp missing');
      files.set(originalPath, temp);
      files.delete(tempPath);
    },
    async writeRecovery(originalPath, bytes) {
      calls.push('writeRecovery');
      const recovery = `${originalPath}.recovery.pdf`;
      files.set(recovery, bytes);
      return recovery;
    },
    async reopenVerify(path) {
      calls.push(`reopenVerify:${path}`);
      if (options?.failOnReopenTemp && path.endsWith('.tmp')) {
        throw new Error('reopen failed');
      }
      const data = files.get(path);
      if (!data || data.length === 0) {
        throw new Error('cannot reopen empty');
      }
      // Minimal parse check: %PDF
      const header = String.fromCharCode(data[0]!, data[1]!, data[2]!, data[3]!);
      if (header !== '%PDF') throw new Error('not a pdf');
    },
  };

  return { io, calls, files };
}

function assertNeverSavedBeforeVerify(
  calls: string[],
  result: SaveResult,
): void {
  const reopenIdx = calls.findIndex((c) => c.startsWith('reopenVerify:'));
  const replaceIdx = calls.indexOf('replaceAtomic');
  expect(reopenIdx).toBeGreaterThanOrEqual(0);
  if (result.success) {
    expect(replaceIdx).toBeGreaterThan(reopenIdx);
    expect(result.verified).toBe(true);
  }
}

describe('verifiedSave', () => {
  it('success path never reports saved before verify', async () => {
    const originalPath = '/docs/sample.pdf';
    const originalBytes = await makeMinimalPdf();
    const { io, calls, files } = createMockIo();
    files.set(originalPath, originalBytes);

    const overlays: OverlayObject[] = [
      {
        id: 'o1',
        pageIndex: 0,
        kind: 'text',
        x: 72,
        y: 100,
        width: 120,
        height: 24,
        rotation: 0,
        zIndex: 1,
        text: 'Signed',
        fontSize: 14,
        color: '#000000',
      },
    ];
    const formFields: FormField[] = [];

    const result = await verifiedSave({
      originalPath,
      originalBytes,
      overlays,
      formFields,
      io,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.verified).toBe(true);
      expect(result.path).toBe(originalPath);
      expect(result.fileSize).toBeGreaterThan(0);
    }

    expect(calls[0]).toBe('writeTemp');
    assertNeverSavedBeforeVerify(calls, result);
    // Temp write and reopen happen before atomic replace
    const writeIdx = calls.indexOf('writeTemp');
    const firstReopen = calls.findIndex((c) => c.startsWith('reopenVerify:'));
    const replaceIdx = calls.indexOf('replaceAtomic');
    expect(writeIdx).toBeLessThan(firstReopen);
    expect(firstReopen).toBeLessThan(replaceIdx);
  });

  it('failure preserves original and may write recovery', async () => {
    const originalPath = '/docs/keep.pdf';
    const originalBytes = await makeMinimalPdf();
    const { io, calls, files } = createMockIo({ failOnReopenTemp: true });
    files.set(originalPath, new Uint8Array(originalBytes));

    const result = await verifiedSave({
      originalPath,
      originalBytes,
      overlays: [],
      formFields: [],
      io,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.originalPreserved).toBe(true);
      expect(result.recoveryPath).toBeTruthy();
    }
    expect(calls).not.toContain('replaceAtomic');
    // Original bytes unchanged
    expect(files.get(originalPath)).toEqual(originalBytes);
  });
});

describe('saveAs', () => {
  it('verifies before reporting success', async () => {
    const targetPath = '/docs/out.pdf';
    const originalBytes = await makeMinimalPdf();
    const { io, calls } = createMockIo();

    const spy = vi.fn();
    const result = await saveAs({
      targetPath,
      originalBytes,
      overlays: [],
      formFields: [],
      io,
    });

    expect(result.success).toBe(true);
    assertNeverSavedBeforeVerify(calls, result);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('buildPdfWithEdits form persistence', () => {
  it('bakes text styling (bold serif + underline) into saved ink', async () => {
    const { buildPdfWithEdits } = await import('./SavePipeline.ts');
    const original = await makeMinimalPdf();
    const overlays: OverlayObject[] = [
      {
        id: 'o2',
        pageIndex: 0,
        kind: 'text',
        x: 72,
        y: 120,
        width: 200,
        height: 24,
        rotation: 0,
        zIndex: 1,
        text: 'Styled Ink',
        fontSize: 14,
        fontFamily: '"Times New Roman", Times, serif',
        bold: true,
        italic: false,
        underline: true,
        color: '#000000',
      },
    ];
    const out = await buildPdfWithEdits(original, overlays, []);
    expect(await extractPageText(out)).toContain('Styled Ink');
    // A Times-Bold font (not plain Helvetica) must be embedded
    const raw = Buffer.from(out).toString('latin1');
    expect(raw).toContain('Times-Bold');
  });

  it('bakes typed AcroForm text into the PDF so other viewers can see it', async () => {
    const { buildPdfWithEdits } = await import('./SavePipeline.ts');
    const src = await PDFDocument.create();
    const page = src.addPage([612, 792]);
    const form = src.getForm();
    const tf = form.createTextField('ShipperName');
    tf.addToPage(page, { x: 72, y: 700, width: 200, height: 20 });
    const original = await src.save();

    const formFields: FormField[] = [
      {
        id: 'f1',
        name: 'ShipperName',
        type: 'text',
        pageIndex: 0,
        rect: { x: 72, y: 72, width: 200, height: 20 },
        value: 'ACME SHIPPING CO',
      },
    ];

    const out = await buildPdfWithEdits(original, [], formFields);
    expect(out.byteLength).toBeGreaterThan(100);

    // Widgets stripped — wording is page ink only
    const reopened = await PDFDocument.load(out);
    expect(reopened.getForm().getFields()).toHaveLength(0);
    expect(await extractPageText(out)).toContain('ACME SHIPPING CO');
  });

  it('does not bake AcroForm auto-size (huge) or centered appearances', async () => {
    const { buildPdfWithEdits } = await import('./SavePipeline.ts');
    const src = await PDFDocument.create();
    const page = src.addPage([612, 792]);
    const form = src.getForm();
    // Tall widget: pdf-lib auto appearance ≈ 29pt without setFontSize
    const tf = form.createTextField('School');
    tf.addToPage(page, { x: 72, y: 650, width: 280, height: 36 });
    tf.setText('IGNORE-ME'); // would flatten huge/centered if we trusted AP
    const font = await src.embedFont(StandardFonts.Helvetica);
    form.updateFieldAppearances(font);
    const original = await src.save();

    const formFields: FormField[] = [
      {
        id: 'f1',
        name: 'School',
        type: 'text',
        pageIndex: 0,
        // Fitted editor box (top-left origin): same page area as widget
        rect: { x: 72, y: 106, width: 280, height: 36 },
        value: 'Saipan Southern High School',
      },
    ];

    const out = await buildPdfWithEdits(original, [], formFields);
    const doc = await pdfjs
      .getDocument({ data: out.slice(), useSystemFonts: true })
      .promise;
    const p = await doc.getPage(1);
    const content = await p.getTextContent();
    const hits = content.items.filter(
      (item): item is { str: string; transform: number[] } =>
        'str' in item &&
        typeof item.str === 'string' &&
        item.str.includes('Saipan'),
    );
    expect(hits.length).toBeGreaterThan(0);
    for (const item of hits) {
      const fontSize = Math.hypot(item.transform[2]!, item.transform[3]!);
      expect(fontSize).toBeLessThanOrEqual(11);
      expect(fontSize).toBeGreaterThanOrEqual(6);
      // Left-aligned in the fitted box (not horizontally centered ~x=160+)
      expect(item.transform[4]!).toBeLessThan(90);
    }
    expect(await extractPageText(out)).not.toContain('IGNORE-ME');
  });

  it('shrinks font so narrow date cells keep full text', async () => {
    const { buildPdfWithEdits } = await import('./SavePipeline.ts');
    const original = await makeMinimalPdf();
    const formFields: FormField[] = [
      {
        id: 'd1',
        name: 'DateCompleted',
        type: 'text',
        pageIndex: 0,
        rect: { x: 400, y: 200, width: 72, height: 18 },
        value: '2023 & 2025',
        synthetic: true,
      },
    ];
    const out = await buildPdfWithEdits(original, [], formFields);
    const text = await extractPageText(out);
    expect(text).toContain('2023');
    expect(text).toContain('2025');
    expect(text).not.toMatch(/023 & 202(?!5)/);
  });

  it('bakes synthetic Smart Fill text even without AcroForm widgets', async () => {
    const { buildPdfWithEdits } = await import('./SavePipeline.ts');
    const original = await makeMinimalPdf();
    const formFields: FormField[] = [
      {
        id: 's1',
        name: 'smartfill:name',
        type: 'text',
        pageIndex: 0,
        rect: { x: 100, y: 200, width: 180, height: 20 },
        value: 'Jane Consignee',
        synthetic: true,
      },
    ];
    const out = await buildPdfWithEdits(original, [], formFields);
    expect(await extractPageText(out)).toContain('Jane Consignee');
  });

  it('saves even when AcroForm widget appearance refs are missing', async () => {
    const { buildPdfWithEdits } = await import('./SavePipeline.ts');
    const { PDFRef } = await import('pdf-lib');
    const src = await PDFDocument.create();
    const page = src.addPage([612, 792]);
    const form = src.getForm();
    const tf = form.createTextField('City');
    tf.addToPage(page, { x: 72, y: 700, width: 120, height: 36 });
    tf.setText('x');
    const font = await src.embedFont(StandardFonts.Helvetica);
    form.updateFieldAppearances(font);
    const intact = await src.save();

    const brokenDoc = await PDFDocument.load(intact);
    const widget = brokenDoc
      .getForm()
      .getTextField('City')
      .acroField.getWidgets()[0]!;
    const ap = widget.getNormalAppearance();
    if (ap instanceof PDFRef) {
      brokenDoc.context.delete(ap);
    }
    const brokenBytes = await brokenDoc.save({
      updateFieldAppearances: false,
    });

    const out = await buildPdfWithEdits(brokenBytes, [], [
      {
        id: 'f1',
        name: 'City',
        type: 'text',
        pageIndex: 0,
        rect: { x: 72, y: 56, width: 120, height: 36 },
        value: 'Saipan',
      },
    ]);
    expect(await extractPageText(out)).toContain('Saipan');
  });
});
