/** Limits and checks for untrusted PDF bytes / paths. */

/** Reject enormous files before pdf.js / pdf-lib allocate (DoS). */
export const MAX_PDF_BYTES = 150 * 1024 * 1024;

/** Cap stored signature data URLs (localStorage + img.src). */
export const MAX_SIGNATURE_DATA_URL_CHARS = 2_500_000;

export function isSafePdfPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0 || path.length > 4096) {
    return false;
  }
  if (path.includes('\0')) return false;
  if (/^(https?:|javascript:|data:|vbscript:)/i.test(path.trim())) return false;
  const normalized = path.replace(/\\/g, '/');
  return /\.pdf$/i.test(normalized);
}

export function assertSafePdfBytes(bytes: Uint8Array, label = 'File'): void {
  if (bytes.byteLength < 5) {
    throw new Error(`${label} is empty or unreadable`);
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error(
      `${label} is too large (max ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} MB)`,
    );
  }
  // PDF files start with %PDF (allow a few leading bytes for quirky writers)
  const probe = bytes.subarray(0, Math.min(1024, bytes.byteLength));
  let found = false;
  for (let i = 0; i <= probe.length - 4; i++) {
    if (
      probe[i] === 0x25 &&
      probe[i + 1] === 0x50 &&
      probe[i + 2] === 0x44 &&
      probe[i + 3] === 0x46
    ) {
      found = true;
      break;
    }
  }
  if (!found) {
    throw new Error(`${label} does not look like a PDF`);
  }
}

/** Only allow local PNG/JPEG data URLs for signature ink. */
export function isSafeSignatureDataUrl(dataUrl: string): boolean {
  if (typeof dataUrl !== 'string') return false;
  if (dataUrl.length === 0 || dataUrl.length > MAX_SIGNATURE_DATA_URL_CHARS) {
    return false;
  }
  return /^data:image\/(png|jpeg|jpg);base64,/i.test(dataUrl);
}
