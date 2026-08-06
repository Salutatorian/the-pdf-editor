/**
 * Lightweight PDF byte checks used before/after export.
 * These do not fully parse the PDF — they catch empty, truncated, or
 * clearly non-PDF outputs before the app reports a successful save.
 */

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46]; // %PDF
const EOF_MARKER = '%%EOF';

function bytesStartWithPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_HEADER.length) return false;
  for (let i = 0; i < PDF_HEADER.length; i++) {
    if (bytes[i] !== PDF_HEADER[i]) return false;
  }
  return true;
}

function bytesContainEof(bytes: Uint8Array): boolean {
  // Search near the end first (typical), then fall back to a full scan.
  const decoder = new TextDecoder('latin1');
  const tailStart = Math.max(0, bytes.length - 2048);
  const tail = decoder.decode(bytes.subarray(tailStart));
  if (tail.includes(EOF_MARKER)) return true;
  if (tailStart === 0) return false;
  return decoder.decode(bytes).includes(EOF_MARKER);
}

export function isNonEmptyPdf(bytes: Uint8Array): boolean {
  return bytes.length > 0 && bytesStartWithPdfHeader(bytes);
}

export function hasEofMarker(bytes: Uint8Array): boolean {
  return bytesContainEof(bytes);
}

export type PdfVerifyResult =
  | { ok: true }
  | { ok: false; error: string };

export function verifyPdfStructure(bytes: Uint8Array): PdfVerifyResult {
  if (bytes.length === 0) {
    return { ok: false, error: 'PDF is empty (0 bytes)' };
  }
  if (!bytesStartWithPdfHeader(bytes)) {
    return { ok: false, error: 'Missing %PDF header' };
  }
  if (!bytesContainEof(bytes)) {
    return { ok: false, error: 'Missing %%EOF marker' };
  }
  return { ok: true };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'] as const;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}
