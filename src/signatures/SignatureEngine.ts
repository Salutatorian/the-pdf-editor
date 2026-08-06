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
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    (v.source === 'drawn' || v.source === 'typed' || v.source === 'imported') &&
    typeof v.dataUrl === 'string' &&
    typeof v.createdAt === 'number'
  );
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
  const entry: SavedSignature = {
    id: input.id ?? uuidv4(),
    name: input.name,
    source: input.source,
    dataUrl: input.dataUrl,
    createdAt: input.createdAt ?? Date.now(),
    fontFamily: input.fontFamily,
  };
  const existing = listSignatures().filter((s) => s.id !== entry.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...existing]));
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
  ctx.fillStyle = '#111111';
  ctx.font = `italic 48px ${fontFamily}, cursive`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 16, height / 2);
  return canvas.toDataURL('image/png');
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load signature image'));
    img.src = dataUrl;
  });
}

/**
 * Make near-white pixels transparent so imported signatures blend on the page.
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
  const threshold = 245;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
