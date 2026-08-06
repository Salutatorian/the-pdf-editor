/**
 * Lightweight PDF compression via pdf-lib re-save.
 *
 * Honest limits: without image recompression / font subsetting beyond what
 * pdf-lib already did, gains are mostly from object streams and dropping
 * unused objects that pdf-lib omits on save. Scanned image-heavy PDFs may
 * shrink little or not at all.
 */

import { PDFDocument } from 'pdf-lib';

export async function compressPdf(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; before: number; after: number }> {
  const before = bytes.byteLength;
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  // useObjectStreams packs objects more tightly; addDefaultPage false avoids
  // accidental empty pages. pdf-lib does not expose a dedicated "strip unused"
  // flag — unused objects are typically omitted when pages/resources are rebuilt.
  const saved = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
  const out = saved instanceof Uint8Array ? saved : new Uint8Array(saved);
  return { bytes: out, before, after: out.byteLength };
}
