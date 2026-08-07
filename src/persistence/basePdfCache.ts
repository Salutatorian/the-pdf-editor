/**
 * Keeps the unbaked "working" PDF bytes per file path so we can reopen
 * editable overlays without stacking ink on already-baked disk files.
 */

const DB_NAME = 'pdf_editor_base_pdfs';
const STORE = 'bases';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function canUseIdb(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function putBasePdf(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  if (!canUseIdb() || !path) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB write failed'));
      tx.objectStore(STORE).put(bytes.slice(), path);
    });
    db.close();
  } catch {
    // Best-effort — reopen may fall back to white-covered overlays
  }
}

export async function getBasePdf(path: string): Promise<Uint8Array | null> {
  if (!canUseIdb() || !path) return null;
  try {
    const db = await openDb();
    const bytes = await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      tx.onerror = () => reject(tx.error ?? new Error('IDB read failed'));
      const req = tx.objectStore(STORE).get(path);
      req.onsuccess = () => {
        const v = req.result;
        if (v instanceof Uint8Array) resolve(v.slice());
        else if (v instanceof ArrayBuffer) resolve(new Uint8Array(v).slice());
        else resolve(null);
      };
    });
    db.close();
    return bytes;
  } catch {
    return null;
  }
}

export async function clearBasePdf(path: string): Promise<void> {
  if (!canUseIdb() || !path) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB delete failed'));
      tx.objectStore(STORE).delete(path);
    });
    db.close();
  } catch {
    // ignore
  }
}
