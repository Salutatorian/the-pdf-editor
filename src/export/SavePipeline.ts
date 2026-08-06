/**
 * Verified save pipeline for pdf_editor.
 *
 * Save contract (MUST be followed by all callers):
 * 1. Write bytes to a temp file beside the original (never overwrite first).
 * 2. Verify non-empty PDF (`isNonEmptyPdf`).
 * 3. Verify structure (`verifyPdfStructure` — header + %%EOF).
 * 4. Reopen/parse successfully via `SaveIO.reopenVerify`.
 * 5. Only then atomically replace the original.
 * 6. NEVER report status "Saved" (or return success) before verification completes.
 *
 * On failure: preserve the original file; optionally write a recovery copy.
 * This module is pure — all filesystem effects go through injected `SaveIO`.
 */

import {
  PDFDocument,
  degrees,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { FormField, OverlayObject } from '../document/types.ts';
import {
  hasEofMarker,
  isNonEmptyPdf,
  verifyPdfStructure,
} from './verifyPdf.ts';

export type SaveResult =
  | {
      success: true;
      path: string;
      fileSize: number;
      timestamp: string;
      verified: true;
    }
  | {
      success: false;
      error: string;
      recoveryPath?: string;
      originalPreserved: true;
    };

export interface SaveIO {
  writeTemp(besidePath: string, bytes: Uint8Array): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  replaceAtomic(originalPath: string, tempPath: string): Promise<void>;
  writeRecovery(originalPath: string, bytes: Uint8Array): Promise<string>;
  /** Must successfully parse the path as a PDF or throw. */
  reopenVerify(path: string): Promise<void>;
}

export type VerifiedSaveArgs = {
  originalPath: string;
  originalBytes: Uint8Array;
  overlays: OverlayObject[];
  formFields: FormField[];
  io: SaveIO;
};

export type SaveAsArgs = {
  targetPath: string;
  originalBytes: Uint8Array;
  overlays: OverlayObject[];
  formFields: FormField[];
  io: SaveIO;
};

function parseHexColor(color: string | undefined): {
  r: number;
  g: number;
  b: number;
} {
  const fallback = { r: 0, g: 0, b: 0 };
  if (!color) return fallback;
  const hex = color.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0]! + hex[0]!, 16);
    const g = parseInt(hex[1]! + hex[1]!, 16);
    const b = parseInt(hex[2]! + hex[2]!, 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return fallback;
    return { r: r / 255, g: g / 255, b: b / 255 };
  }
  if (hex.length !== 6) return fallback;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return fallback;
  return { r: r / 255, g: g / 255, b: b / 255 };
}

/** Convert top-left UI coords to PDF bottom-left coords. */
function toPdfY(
  pageHeight: number,
  topY: number,
  objectHeight: number,
): number {
  return pageHeight - topY - objectHeight;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function embedImage(
  pdfDoc: PDFDocument,
  dataUrl: string,
): Promise<Awaited<ReturnType<PDFDocument['embedPng']>>> {
  const bytes = dataUrlToBytes(dataUrl);
  const isJpg =
    dataUrl.startsWith('data:image/jpeg') ||
    dataUrl.startsWith('data:image/jpg');
  if (isJpg) {
    return pdfDoc.embedJpg(bytes);
  }
  return pdfDoc.embedPng(bytes);
}

async function applyFormValues(
  pdfDoc: PDFDocument,
  formFields: FormField[],
): Promise<void> {
  let form;
  try {
    form = pdfDoc.getForm();
  } catch {
    return;
  }
  const fieldsByName = new Map(formFields.map((f) => [f.name, f]));

  for (const field of form.getFields()) {
    const name = field.getName();
    const source = fieldsByName.get(name);
    if (!source) continue;

    const ctor = field.constructor.name;
    try {
      if (ctor === 'PDFTextField') {
        const textField = form.getTextField(name);
        textField.setText(source.value);
      } else if (ctor === 'PDFCheckBox') {
        const checkBox = form.getCheckBox(name);
        if (source.value === 'true' || source.value === 'Yes' || source.value === '1') {
          checkBox.check();
        } else {
          checkBox.uncheck();
        }
      } else if (ctor === 'PDFRadioGroup') {
        const radio = form.getRadioGroup(name);
        if (source.value) radio.select(source.value);
      } else if (ctor === 'PDFDropdown') {
        const dropdown = form.getDropdown(name);
        if (source.value) dropdown.select(source.value);
      } else if (ctor === 'PDFOptionList') {
        const list = form.getOptionList(name);
        if (source.value) list.select(source.value);
      }
    } catch {
      // Skip fields that cannot be updated (locked / mismatched type).
    }
  }
}

function drawOverlay(
  page: PDFPage,
  overlay: OverlayObject,
  font: PDFFont,
  images: Map<string, Awaited<ReturnType<PDFDocument['embedPng']>>>,
): void {
  const pageHeight = page.getHeight();
  const pdfY = toPdfY(pageHeight, overlay.y, overlay.height);
  const color = parseHexColor(overlay.color);
  const opacity = overlay.opacity ?? 1;
  const stroke = overlay.strokeWidth ?? 1;

  switch (overlay.kind) {
    case 'text':
    case 'date':
    case 'initials': {
      const size = overlay.fontSize ?? 12;
      page.drawText(overlay.text ?? '', {
        x: overlay.x,
        y: pdfY + (overlay.height - size) / 2,
        size,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity,
        rotate: overlay.rotation ? degrees(-overlay.rotation) : undefined,
      });
      break;
    }
    case 'highlight': {
      page.drawRectangle({
        x: overlay.x,
        y: pdfY,
        width: overlay.width,
        height: overlay.height,
        color: rgb(color.r || 1, color.g || 1, color.b || 0),
        opacity: opacity * 0.35,
      });
      break;
    }
    case 'redact': {
      // Opaque black rectangle — visual redaction (content may still exist underneath).
      page.drawRectangle({
        x: overlay.x,
        y: pdfY,
        width: overlay.width,
        height: overlay.height,
        color: rgb(0, 0, 0),
        opacity: 1,
      });
      break;
    }
    case 'checkmark': {
      page.drawText('✓', {
        x: overlay.x + overlay.width * 0.15,
        y: pdfY + overlay.height * 0.15,
        size: Math.min(overlay.width, overlay.height) * 0.85,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity,
      });
      break;
    }
    case 'shape': {
      const shape = overlay.shapeType ?? 'rect';
      if (shape === 'ellipse') {
        page.drawEllipse({
          x: overlay.x + overlay.width / 2,
          y: pdfY + overlay.height / 2,
          xScale: overlay.width / 2,
          yScale: overlay.height / 2,
          borderColor: rgb(color.r, color.g, color.b),
          borderWidth: stroke,
          opacity,
        });
      } else if (shape === 'line') {
        page.drawLine({
          start: { x: overlay.x, y: pdfY + overlay.height },
          end: { x: overlay.x + overlay.width, y: pdfY },
          thickness: stroke,
          color: rgb(color.r, color.g, color.b),
          opacity,
        });
      } else {
        page.drawRectangle({
          x: overlay.x,
          y: pdfY,
          width: overlay.width,
          height: overlay.height,
          borderColor: rgb(color.r, color.g, color.b),
          borderWidth: stroke,
          opacity,
        });
      }
      break;
    }
    case 'draw': {
      const points = overlay.pathPoints ?? [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!;
        const b = points[i]!;
        page.drawLine({
          start: { x: a.x, y: toPdfY(pageHeight, a.y, 0) },
          end: { x: b.x, y: toPdfY(pageHeight, b.y, 0) },
          thickness: stroke,
          color: rgb(color.r, color.g, color.b),
          opacity,
        });
      }
      break;
    }
    case 'image':
    case 'signature': {
      const key = overlay.imageDataUrl;
      if (!key) break;
      const image = images.get(key);
      if (!image) break;
      page.drawImage(image, {
        x: overlay.x,
        y: pdfY,
        width: overlay.width,
        height: overlay.height,
        opacity,
      });
      break;
    }
  }
}

/**
 * Build a new PDF by applying AcroForm values and drawing overlays.
 * Overlay coordinates are top-left origin; PDF uses bottom-left.
 */
export async function buildPdfWithEdits(
  originalBytes: Uint8Array,
  overlays: OverlayObject[],
  formFields: FormField[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  await applyFormValues(pdfDoc, formFields);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const imageCache = new Map<
    string,
    Awaited<ReturnType<PDFDocument['embedPng']>>
  >();

  for (const overlay of overlays) {
    if (
      (overlay.kind === 'image' || overlay.kind === 'signature') &&
      overlay.imageDataUrl &&
      !imageCache.has(overlay.imageDataUrl)
    ) {
      try {
        const img = await embedImage(pdfDoc, overlay.imageDataUrl);
        imageCache.set(overlay.imageDataUrl, img);
      } catch {
        // Skip unreadable images.
      }
    }
  }

  const sorted = [...overlays].sort((a, b) => a.zIndex - b.zIndex);
  for (const overlay of sorted) {
    const page = pages[overlay.pageIndex];
    if (!page) continue;
    drawOverlay(page, overlay, font, imageCache);
  }

  const saved = await pdfDoc.save({ useObjectStreams: false });
  return saved;
}

export async function verifyExport(bytes: Uint8Array): Promise<void> {
  if (!isNonEmptyPdf(bytes)) {
    throw new Error('Export verification failed: empty or missing %PDF header');
  }
  const structure = verifyPdfStructure(bytes);
  if (!structure.ok) {
    throw new Error(`Export verification failed: ${structure.error}`);
  }
  if (!hasEofMarker(bytes)) {
    throw new Error('Export verification failed: missing %%EOF');
  }
  // Round-trip parse with pdf-lib
  await PDFDocument.load(bytes, { ignoreEncryption: true });
}

async function failWithRecovery(
  error: string,
  originalPath: string,
  bytes: Uint8Array | null,
  io: SaveIO,
): Promise<SaveResult> {
  let recoveryPath: string | undefined;
  if (bytes) {
    try {
      recoveryPath = await io.writeRecovery(originalPath, bytes);
    } catch {
      // Recovery write is best-effort.
    }
  }
  return {
    success: false,
    error,
    recoveryPath,
    originalPreserved: true,
  };
}

/**
 * Verified in-place save. Never reports success before temp write + verify + reopen.
 */
export async function verifiedSave(args: VerifiedSaveArgs): Promise<SaveResult> {
  const { originalPath, originalBytes, overlays, formFields, io } = args;
  let built: Uint8Array | null = null;

  try {
    built = await buildPdfWithEdits(originalBytes, overlays, formFields);
    await verifyExport(built);

    const tempPath = await io.writeTemp(originalPath, built);

    const tempBytes = await io.readFile(tempPath);
    await verifyExport(tempBytes);
    await io.reopenVerify(tempPath);

    await io.replaceAtomic(originalPath, tempPath);
    await io.reopenVerify(originalPath);

    const finalBytes = await io.readFile(originalPath);
    await verifyExport(finalBytes);

    return {
      success: true,
      path: originalPath,
      fileSize: finalBytes.length,
      timestamp: new Date().toISOString(),
      verified: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failWithRecovery(message, originalPath, built, io);
  }
}

/**
 * Save-as path: write to target via temp + verify, then replace into target.
 * Same verification guarantees as `verifiedSave`.
 */
export async function saveAs(args: SaveAsArgs): Promise<SaveResult> {
  const { targetPath, originalBytes, overlays, formFields, io } = args;
  let built: Uint8Array | null = null;

  try {
    built = await buildPdfWithEdits(originalBytes, overlays, formFields);
    await verifyExport(built);

    const tempPath = await io.writeTemp(targetPath, built);
    const tempBytes = await io.readFile(tempPath);
    await verifyExport(tempBytes);
    await io.reopenVerify(tempPath);

    await io.replaceAtomic(targetPath, tempPath);
    await io.reopenVerify(targetPath);

    const finalBytes = await io.readFile(targetPath);
    await verifyExport(finalBytes);

    return {
      success: true,
      path: targetPath,
      fileSize: finalBytes.length,
      timestamp: new Date().toISOString(),
      verified: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failWithRecovery(message, targetPath, built, io);
  }
}
