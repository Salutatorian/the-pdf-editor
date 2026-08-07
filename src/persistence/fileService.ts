/**
 * Abstract file IO: Tauri desktop when available, browser File API fallbacks for tests/dev.
 */

import { assertSafePdfBytes, isSafePdfPath } from './pdfSafety.ts';

export type OpenedPdf = {
  path: string;
  bytes: Uint8Array;
  name: string;
};

type TauriDialogModule = typeof import('@tauri-apps/plugin-dialog');
type TauriFsModule = typeof import('@tauri-apps/plugin-fs');

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window
  );
}

async function loadDialog(): Promise<TauriDialogModule> {
  return import('@tauri-apps/plugin-dialog');
}

async function loadFs(): Promise<TauriFsModule> {
  return import('@tauri-apps/plugin-fs');
}

function fileNameFromPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

async function readFileAsBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Open a PDF via native dialog (Tauri) or `<input type="file">` (browser).
 * Never throws on cancel; throws only on read failures after a path is chosen.
 */
export async function openPdfDialog(): Promise<OpenedPdf | null> {
  if (isTauri()) {
    const dialog = await loadDialog();
    const fs = await loadFs();
    let selected: string | string[] | null;
    try {
      selected = await dialog.open({
        multiple: false,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
    } catch {
      return null;
    }
    if (selected === null || Array.isArray(selected)) return null;
    const path = selected;
    if (!isSafePdfPath(path)) {
      throw new Error('Selected path is not a valid PDF file');
    }
    const data = await fs.readFile(path);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    assertSafePdfBytes(bytes, 'Selected file');
    return { path, bytes, name: fileNameFromPath(path) };
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      void readFileAsBytes(file)
        .then((bytes) => {
          try {
            assertSafePdfBytes(bytes, file.name);
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
            return;
          }
          resolve({
            path: file.name,
            bytes,
            name: file.name,
          });
        })
        .catch((err: unknown) => {
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function readPdfFromPath(path: string): Promise<Uint8Array> {
  if (!isSafePdfPath(path)) {
    throw new Error('Refusing to open unsafe or non-PDF path');
  }
  if (isTauri()) {
    const fs = await loadFs();
    const data = await fs.readFile(path);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    assertSafePdfBytes(bytes, fileNameFromPath(path));
    return bytes;
  }
  throw new Error(
    `readPdfFromPath is only available in the desktop app (got: ${path})`,
  );
}

export async function saveBytes(path: string, bytes: Uint8Array): Promise<void> {
  if (!isSafePdfPath(path)) {
    throw new Error('Refusing to write to a non-PDF path');
  }
  assertSafePdfBytes(bytes, 'Output');
  if (isTauri()) {
    const fs = await loadFs();
    await fs.writeFile(path, bytes);
    return;
  }

  // Browser fallback: trigger a download
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/pdf',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileNameFromPath(path) || 'document.pdf';
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function pickSavePath(
  defaultName: string,
): Promise<string | null> {
  const safeDefault = defaultName.toLowerCase().endsWith('.pdf')
    ? defaultName
    : `${defaultName}.pdf`;
  if (isTauri()) {
    const dialog = await loadDialog();
    const path = await dialog.save({
      defaultPath: safeDefault,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (path && !isSafePdfPath(path)) {
      throw new Error('Save path must end with .pdf');
    }
    return path ?? null;
  }

  // Browser cannot pick an arbitrary filesystem path; return the suggested name.
  return safeDefault;
}
