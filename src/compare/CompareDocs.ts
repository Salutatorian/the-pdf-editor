import { PDFDocument } from 'pdf-lib';

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function comparePageCounts(
  a: Uint8Array,
  b: Uint8Array,
): Promise<{ a: number; b: number; equal: boolean }> {
  const docA = await PDFDocument.load(a, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const docB = await PDFDocument.load(b, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const countA = docA.getPageCount();
  const countB = docB.getPageCount();
  return { a: countA, b: countB, equal: countA === countB };
}

export async function compareByteHash(
  a: Uint8Array,
  b: Uint8Array,
): Promise<{ equal: boolean; aHash: string; bHash: string }> {
  const [aHash, bHash] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  return { equal: aHash === bHash, aHash, bHash };
}
