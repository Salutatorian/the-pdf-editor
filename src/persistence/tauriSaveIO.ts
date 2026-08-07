/**
 * SaveIO adapters for Tauri (plugin-fs) and browser (download + in-memory).
 */

import { PDFDocument } from 'pdf-lib';
import type { SaveIO } from '../export/SavePipeline.ts';
import { isTauri } from './fileService.ts';

type TauriFsModule = typeof import('@tauri-apps/plugin-fs');

async function loadFs(): Promise<TauriFsModule> {
  return import('@tauri-apps/plugin-fs');
}

function stemAndDir(path: string): { dir: string; stem: string; name: string } {
  const normalized = path.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  const name = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const dir = slash >= 0 ? path.slice(0, path.length - name.length) : '';
  const stem = name.toLowerCase().endsWith('.pdf')
    ? name.slice(0, -4)
    : name;
  return { dir, stem, name };
}

function joinPath(dir: string, file: string): string {
  if (!dir) return file;
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${file}` : `${dir}${sep}${file}`;
}

async function reopenWithPdfLib(bytes: Uint8Array): Promise<void> {
  await PDFDocument.load(bytes, { ignoreEncryption: true });
}

async function reopenWithPdfJs(bytes: Uint8Array): Promise<void> {
  const { loadPdfDocument } = await import('../viewer/pdfjs.ts');
  const doc = await loadPdfDocument(bytes);
  try {
    if (doc.numPages < 1) {
      throw new Error('PDF has no pages');
    }
    await doc.getPage(1);
  } finally {
    // cleanup() can hang on Windows — never block Save on it
    void Promise.race([
      doc.cleanup().catch(() => undefined),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 400);
      }),
    ]);
  }
}

export async function reopenVerifyBytes(bytes: Uint8Array): Promise<void> {
  await reopenWithPdfLib(bytes);
  try {
    await reopenWithPdfJs(bytes);
  } catch {
    // pdf.js may fail in node/test environments; pdf-lib is enough
  }
}

async function uniqueTempPath(besidePath: string): Promise<string> {
  const { dir, stem } = stemAndDir(besidePath);
  const token = `${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
  return joinPath(dir, `${stem}.pdf_editor.${token}.tmp.pdf`);
}

/**
 * Replace destination with temp contents WITHOUT deleting the original first.
 * Prefer rename via backup so a crash never leaves a truncated PDF.
 */
async function replaceWithoutDeletingOriginal(
  fs: TauriFsModule,
  originalPath: string,
  tempPath: string,
): Promise<void> {
  const fsAny = fs as TauriFsModule & {
    rename?: (from: string, to: string) => Promise<void>;
    remove?: (path: string) => Promise<void>;
    copyFile?: (from: string, to: string) => Promise<void>;
    exists?: (path: string) => Promise<boolean>;
  };

  // 1) Rename swap: original → .bak, temp → original, delete .bak
  if (typeof fsAny.rename === 'function') {
    const backupPath = `${originalPath}.pdf_editor.bak`;
    let movedOriginal = false;
    try {
      try {
        await fsAny.remove?.(backupPath);
      } catch {
        // no prior bak
      }
      const originalExists =
        typeof fsAny.exists === 'function'
          ? await fsAny.exists(originalPath)
          : true;
      if (originalExists) {
        await fsAny.rename(originalPath, backupPath);
        movedOriginal = true;
      }
      await fsAny.rename(tempPath, originalPath);
      if (movedOriginal) {
        try {
          await fsAny.remove?.(backupPath);
        } catch {
          // bak left behind is recoverable
        }
      }
      return;
    } catch (err) {
      if (movedOriginal) {
        try {
          await fsAny.rename(backupPath, originalPath);
        } catch {
          // both restore and replace failed — surface original error
        }
      }
      // Fall through to safer overwrite strategies
      void err;
    }
  }

  // 2) Copy-over if available
  if (typeof fsAny.copyFile === 'function') {
    try {
      await fsAny.copyFile(tempPath, originalPath);
      try {
        await fsAny.remove?.(tempPath);
      } catch {
        // best-effort cleanup
      }
      return;
    } catch {
      // Fall through
    }
  }

  // 3) Last resort: overwrite in place (never delete original first)
  const bytes = await fs.readFile(tempPath);
  await fs.writeFile(
    originalPath,
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
  );
  try {
    await fsAny.remove?.(tempPath);
  } catch {
    // best-effort cleanup
  }
}

/** In-memory + download SaveIO for browser / tests. */
export function createBrowserSaveIO(options?: {
  downloads?: Map<string, Uint8Array>;
}): SaveIO {
  const store = options?.downloads ?? new Map<string, Uint8Array>();

  const triggerDownload = (path: string, bytes: Uint8Array): void => {
    if (typeof document === 'undefined') return;
    const name = stemAndDir(path).name || 'document.pdf';
    const copy = bytes.slice();
    const blob = new Blob([copy.buffer as ArrayBuffer], {
      type: 'application/pdf',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return {
    async writeTemp(besidePath, bytes) {
      const tempPath = await uniqueTempPath(besidePath);
      store.set(tempPath, bytes.slice());
      return tempPath;
    },
    async readFile(path) {
      const data = store.get(path);
      if (!data) throw new Error(`File not found: ${path}`);
      return data.slice();
    },
    async replaceAtomic(originalPath, tempPath) {
      const temp = store.get(tempPath);
      if (!temp) throw new Error(`Temp file missing: ${tempPath}`);
      store.set(originalPath, temp.slice());
      store.delete(tempPath);
      triggerDownload(originalPath, temp);
    },
    async writeRecovery(originalPath, bytes) {
      const { dir, stem } = stemAndDir(originalPath);
      const recoveryPath = joinPath(dir, `${stem}.pdf_editor.recovery.pdf`);
      store.set(recoveryPath, bytes.slice());
      triggerDownload(recoveryPath, bytes);
      return recoveryPath;
    },
    async reopenVerify(path) {
      const data = store.get(path);
      if (!data) throw new Error(`Cannot reopen missing file: ${path}`);
      await reopenVerifyBytes(data);
    },
  };
}

/** Tauri desktop SaveIO using plugin-fs. */
export function createTauriSaveIO(): SaveIO {
  return {
    async writeTemp(besidePath, bytes) {
      const fs = await loadFs();
      const tempPath = await uniqueTempPath(besidePath);
      await fs.writeFile(tempPath, bytes);
      return tempPath;
    },
    async readFile(path) {
      const fs = await loadFs();
      const data = await fs.readFile(path);
      return data instanceof Uint8Array ? data : new Uint8Array(data);
    },
    async replaceAtomic(originalPath, tempPath) {
      const fs = await loadFs();
      await replaceWithoutDeletingOriginal(fs, originalPath, tempPath);
    },
    async writeRecovery(originalPath, bytes) {
      const fs = await loadFs();
      const { dir, stem } = stemAndDir(originalPath);
      const recoveryPath = joinPath(dir, `${stem}.pdf_editor.recovery.pdf`);
      await fs.writeFile(recoveryPath, bytes);
      return recoveryPath;
    },
    async reopenVerify(path) {
      const fs = await loadFs();
      const data = await fs.readFile(path);
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      await reopenVerifyBytes(bytes);
    },
  };
}

export function createSaveIO(): SaveIO {
  if (isTauri()) {
    return createTauriSaveIO();
  }
  return createBrowserSaveIO();
}
