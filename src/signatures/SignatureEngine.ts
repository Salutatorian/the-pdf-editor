/**
 * SignatureEngine — visual (appearance) signatures only.
 *
 * IMPORTANT: A drawn, typed, or imported signature image placed on a PDF is a
 * *visual* signature. It is NOT a certificate-based digital signature (PKI /
 * DocMDP / Adobe.PPKLite). Visual signatures do not cryptographically bind the
 * document or prove signer identity. Do not present them as legally equivalent
 * to certified digital signatures unless your jurisdiction and product policy
 * explicitly allow ink-style wet signatures for that use case.
 */

import { v4 as uuidv4 } from 'uuid';
import { isSafeSignatureDataUrl } from '../persistence/pdfSafety.ts';

export type SignatureSource = 'drawn' | 'typed' | 'imported';

export type SavedSignature = {
  id: string;
  name: string;
  source: SignatureSource;
  dataUrl: string;
  createdAt: number;
  fontFamily?: string;
};

const STORAGE_KEY = 'pdf_editor:signatures';

function isSavedSignature(value: unknown): value is SavedSignature {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== 'string' ||
    typeof v.name !== 'string' ||
    (v.source !== 'drawn' && v.source !== 'typed' && v.source !== 'imported') ||
    typeof v.dataUrl !== 'string' ||
    typeof v.createdAt !== 'number'
  ) {
    return false;
  }
  return isSafeSignatureDataUrl(v.dataUrl);
}

export function listSignatures(): SavedSignature[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedSignature);
  } catch {
    return [];
  }
}

export function saveSignature(
  input: Omit<SavedSignature, 'id' | 'createdAt'> & {
    id?: string;
    createdAt?: number;
  },
): SavedSignature {
  if (!isSafeSignatureDataUrl(input.dataUrl)) {
    throw new Error('Signature image must be a PNG/JPEG data URL');
  }
  const entry: SavedSignature = {
    id: input.id ?? uuidv4(),
    name: input.name.slice(0, 120),
    source: input.source,
    dataUrl: input.dataUrl,
    createdAt: input.createdAt ?? Date.now(),
    fontFamily: input.fontFamily,
  };
  const existing = listSignatures().filter((s) => s.id !== entry.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...existing].slice(0, 40)));
  return entry;
}

export function deleteSignature(id: string): void {
  const next = listSignatures().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** Derive initials from a full name, e.g. "Jane Q Public" → "JQP". */
export function initialsFromName(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .join('')
    .slice(0, 4);
}

/**
 * Render a typed signature to a PNG data URL via canvas.
 */
export function renderTypedSignature(
  text: string,
  fontFamily: string,
): string {
  const canvas = document.createElement('canvas');
  const width = Math.max(320, text.length * 28);
  const height = 96;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#000000';
  ctx.font = `italic 48px ${fontFamily}, cursive`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 16, height / 2);
  return canvas.toDataURL('image/png');
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  if (!isSafeSignatureDataUrl(dataUrl)) {
    return Promise.reject(new Error('Unsafe signature image'));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load signature image'));
    img.src = dataUrl;
  });
}

/**
 * Make near-white / opaque-pad pixels transparent so only ink shows on the page.
 */
export async function cleanupSignaturePng(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const threshold = 240;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    // Fully white / near-white → transparent
    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i + 3] = 0;
      continue;
    }
    // Soften light gray halos from antialiasing on white pads
    if (a > 0 && r > 200 && g > 200 && b > 200) {
      const whiteness = (r + g + b) / (3 * 255);
      data[i + 3] = Math.round(a * (1 - whiteness) * 1.2);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Ensure drawn/typed/imported signatures export as transparent ink only. */
export async function toTransparentSignatureInk(
  dataUrl: string,
): Promise<string> {
  try {
    return await cleanupSignaturePng(dataUrl);
  } catch {
    return dataUrl;
  }
}
