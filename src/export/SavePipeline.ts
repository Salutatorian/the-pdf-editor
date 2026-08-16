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
  PDFName,
  PDFDict,
  PDFArray,
  PDFRef,
  degrees,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { FormField, OverlayObject } from '../document/types.ts';
import { pdfBaseForFamily } from '../document/fonts.ts';
import { formFieldTextSize } from '../forms/formFieldTypography.ts';
import {
  hasEofMarker,
  isNonEmptyPdf,
  verifyPdfStructure,
} from './verifyPdf.ts';

export { formFieldTextSize } from '../forms/formFieldTypography.ts';

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

/**
 * Soft-wrap so saved ink stays inside the field (no sideways spill).
 * Declared early — sizing + draw both use it.
 */
function wrapTextToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph) {
      out.push('');
      continue;
    }
    let line = '';
    for (const ch of paragraph) {
      const next = line + ch;
      if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
        out.push(line);
        line = ch === ' ' ? '' : ch;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
  }
  return out.length > 0 ? out : [''];
}

/**
 * Shrink point size until wrapped lines fit the fitted box.
 * Fixes narrow cells (e.g. "Date completed") clipping to "023 & 202".
 */
function fitFormFieldFontSize(
  rect: { width: number; height: number },
  text: string,
  font: PDFFont,
): number {
  let size = formFieldTextSize(rect);
  const maxWidth = Math.max(8, rect.width - 4);
  while (size > 6) {
    const lineHeight = size * 1.2;
    const lines = wrapTextToWidth(text, font, size, maxWidth);
    const maxLines = Math.max(1, Math.floor(rect.height / lineHeight));
    if (lines.length <= maxLines) return size;
    size -= 0.5;
  }
  return 6;
}

/**
 * Drop the interactive form without pdf-lib's removeField/flatten.
 *
 * Real employment PDFs often have widgets whose /AP ref is missing. Calling
 * getForm().removeField() or save()'s default updateFieldAppearances then
 * throws: "Expected instance of PDFDict or PDFStream, but got instance of
 * undefined" — and Save fails entirely.
 *
 * We already baked fill ink; delete /AcroForm + Widget annots so viewers
 * show that ink without auto-sized appearances.
 */
function stripAcroFormSafely(pdfDoc: PDFDocument): void {
  try {
    pdfDoc.catalog.delete(PDFName.of('AcroForm'));
  } catch {
    // catalog may already lack AcroForm
  }

  for (const page of pdfDoc.getPages()) {
    try {
      const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      if (!annots) continue;

      const kept = PDFArray.withContext(pdfDoc.context);
      for (let i = 0; i < annots.size(); i++) {
        const entry = annots.get(i);
        if (!(entry instanceof PDFRef)) {
          // Rare direct dict — keep if not a Widget
          if (entry instanceof PDFDict) {
            const subtype = entry.get(PDFName.of('Subtype'));
            if (subtype !== PDFName.of('Widget')) kept.push(entry);
          }
          continue;
        }
        const dict = pdfDoc.context.lookupMaybe(entry, PDFDict);
        if (!dict) continue; // dangling ref — drop
        const subtype = dict.get(PDFName.of('Subtype'));
        if (subtype !== PDFName.of('Widget')) {
          kept.push(entry);
        }
      }

      if (kept.size() === 0) {
        page.node.delete(PDFName.of('Annots'));
      } else {
        page.node.set(PDFName.of('Annots'), kept);
      }
    } catch {
      // leave page annots alone if structure is too broken
    }
  }
}

/**
 * Draw filled values as permanent page ink so ANY PDF viewer (browser,
 * Preview, etc.) matches the editor's fitted box + typography.
 */
function drawFilledFormFields(
  pdfDoc: PDFDocument,
  formFields: FormField[],
  font: PDFFont,
): void {
  const pages = pdfDoc.getPages();
  for (const field of formFields) {
    const page = pages[field.pageIndex];
    if (!page) continue;
    const layout = field;
    const pageHeight = page.getHeight();
    const pdfY = toPdfY(pageHeight, layout.rect.y, layout.rect.height);

    if (field.type === 'checkbox') {
      const on =
        field.value === 'true' ||
        field.value === 'Yes' ||
        field.value === '1' ||
        field.value === 'on';
      if (!on && !field.synthetic) continue;
      if (field.synthetic) {
        page.drawRectangle({
          x: layout.rect.x,
          y: pdfY,
          width: layout.rect.width,
          height: layout.rect.height,
          borderColor: rgb(0.1, 0.1, 0.1),
          borderWidth: 1,
          color: rgb(1, 1, 1),
        });
      }
      if (on) {
        const mark = Math.min(
          12,
          Math.max(8, Math.min(layout.rect.width, layout.rect.height) * 0.75),
        );
        page.drawText('X', {
          x: layout.rect.x + Math.max(1, (layout.rect.width - mark * 0.6) / 2),
          y: pdfY + Math.max(1, (layout.rect.height - mark) / 2),
          size: mark,
          font,
          color: rgb(0, 0, 0),
        });
      }
      continue;
    }

    if (field.type === 'signature' && field.value.startsWith('data:image/')) {
      continue;
    }

    if (field.value.startsWith('data:image/')) continue;

    const text = field.value?.trim();
    if (!text) continue;
    const safe = text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');
    const maxWidth = Math.max(8, layout.rect.width - 4);
    const size = fitFormFieldFontSize(layout.rect, safe, font);
    const lineHeight = size * 1.2;
    const lines = wrapTextToWidth(safe, font, size, maxWidth);
    const maxLines = Math.max(1, Math.floor(layout.rect.height / lineHeight));
    // Left + top of the same fitted rect the editor uses (not AcroForm center)
    let cursorY = pdfY + layout.rect.height - size - 2;
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      const line = lines[i];
      if (line === undefined) continue;
      page.drawText(line, {
        x: layout.rect.x + 2,
        y: cursorY,
        size,
        font,
        color: rgb(0, 0, 0),
      });
      cursorY -= lineHeight;
      if (cursorY < pdfY - 1) break;
    }
  }
}

/**
 * Saved PDFs can only use the 14 standard fonts without embedding font
 * files, so text overlays map to Helvetica / Times-Roman / Courier with
 * real bold/italic variants. On-screen the chosen CSS font is used.
 */
function standardFontFor(overlay: OverlayObject): StandardFonts {
  const base = pdfBaseForFamily(overlay.fontFamily);
  const bold = Boolean(overlay.bold);
  const italic = Boolean(overlay.italic);
  switch (base) {
    case 'serif':
      if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
      if (bold) return StandardFonts.TimesRomanBold;
      if (italic) return StandardFonts.TimesRomanItalic;
      return StandardFonts.TimesRoman;
    case 'mono':
      if (bold && italic) return StandardFonts.CourierBoldOblique;
      if (bold) return StandardFonts.CourierBold;
      if (italic) return StandardFonts.CourierOblique;
      return StandardFonts.Courier;
    case 'sans':
      if (bold && italic) return StandardFonts.HelveticaBoldOblique;
      if (bold) return StandardFonts.HelveticaBold;
      if (italic) return StandardFonts.HelveticaOblique;
      return StandardFonts.Helvetica;
    default: {
      const exhaustive: never = base;
      return exhaustive;
    }
  }
}

/** Underline baked ink: a line just below the baseline, rotated with the text. */
function drawUnderline(
  page: PDFPage,
  overlay: OverlayObject,
  font: PDFFont,
  baselineY: number,
  size: number,
  color: { r: number; g: number; b: number },
  opacity: number,
): void {
  const content = overlay.text ?? '';
  if (!content.trim()) return;
  const longest = content
    .split(/\r?\n/)
    .reduce((max, line) => Math.max(max, font.widthOfTextAtSize(line, size)), 0);
  if (longest <= 0) return;
  const underlineY = baselineY - Math.max(1.5, size * 0.12);
  const angle = (-(overlay.rotation ?? 0) * Math.PI) / 180;
  page.drawLine({
    start: { x: overlay.x, y: underlineY },
    end: {
      x: overlay.x + Math.cos(angle) * longest,
      y: underlineY + Math.sin(angle) * longest,
    },
    thickness: Math.max(0.5, size / 14),
    color: rgb(color.r, color.g, color.b),
    opacity,
  });
}

function drawOverlay(
  page: PDFPage,
  overlay: OverlayObject,
  font: PDFFont,
  fonts: Map<StandardFonts, PDFFont>,
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
      const textFont = fonts.get(standardFontFor(overlay)) ?? font;
      const baselineY = pdfY + (overlay.height - size) / 2;
      page.drawText(overlay.text ?? '', {
        x: overlay.x,
        y: baselineY,
        size,
        font: textFont,
        color: rgb(color.r, color.g, color.b),
        opacity,
        rotate: overlay.rotation ? degrees(-overlay.rotation) : undefined,
      });
      if (overlay.underline) {
        drawUnderline(page, overlay, textFont, baselineY, size, color, opacity);
      }
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
 * Build a new PDF by drawing fill ink at the editor's fitted boxes, then
 * stripping AcroForm widgets (never flatten — that bakes auto-sized/centered
 * appearances). Overlay coordinates are top-left; PDF uses bottom-left.
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

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // WYSIWYG ink first — same rects/sizes as FormOverlay
  drawFilledFormFields(pdfDoc, formFields, font);
  // Drop widgets without getForm/removeField (those crash on broken /AP refs)
  stripAcroFormSafely(pdfDoc);

  const pages = pdfDoc.getPages();
  const imageCache = new Map<
    string,
    Awaited<ReturnType<PDFDocument['embedPng']>>
  >();

  // Signature field ink (AcroForm + synthetic) — same pixels as on-screen
  for (const field of formFields) {
    if (field.type !== 'signature') continue;
    if (!field.value.startsWith('data:image/')) continue;
    if (imageCache.has(field.value)) continue;
    // Skip if an overlay already carries this exact image (avoid double-draw)
    const coveredByOverlay = overlays.some(
      (o) =>
        o.kind === 'signature' &&
        o.imageDataUrl === field.value &&
        o.pageIndex === field.pageIndex,
    );
    if (coveredByOverlay) continue;
    try {
      const img = await embedImage(pdfDoc, field.value);
      imageCache.set(field.value, img);
      const page = pages[field.pageIndex];
      if (!page) continue;
      const pageHeight = page.getHeight();
      const pdfY = toPdfY(pageHeight, field.rect.y, field.rect.height);
      page.drawImage(img, {
        x: field.rect.x,
        y: pdfY,
        width: field.rect.width,
        height: field.rect.height,
      });
    } catch {
      // skip
    }
  }

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

  // Embed only the standard-font variants the text overlays actually use
  const fonts = new Map<StandardFonts, PDFFont>([[StandardFonts.Helvetica, font]]);
  for (const overlay of sorted) {
    if (overlay.kind !== 'text' && overlay.kind !== 'date' && overlay.kind !== 'initials') {
      continue;
    }
    const variant = standardFontFor(overlay);
    if (!fonts.has(variant)) {
      fonts.set(variant, await pdfDoc.embedFont(variant));
    }
  }

  for (const overlay of sorted) {
    const page = pages[overlay.pageIndex];
    if (!page) continue;
    drawOverlay(page, overlay, font, fonts, imageCache);
  }

  // Never updateFieldAppearances — employment forms have dangling AP refs
  // that throw "Expected instance of PDFDict or PDFStream, but got undefined"
  const saved = await pdfDoc.save({
    useObjectStreams: false,
    updateFieldAppearances: false,
  });
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
