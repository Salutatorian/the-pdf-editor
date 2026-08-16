/**
 * Open PDFs handed to the app by the OS ("Open with", double-click, etc.).
 * Cold start: Rust stashes paths → take_opened_files().
 * Warm start (app already open): Rust emits "open-files".
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from './fileService.ts';
import { isSafePdfPath } from './pdfSafety.ts';

function fileNameFromPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

export type OpenOsFileHandler = (path: string, name: string) => void;

/**
 * Subscribe once. Returns an unlisten that stops both the event listener
 * and ignores further cold-start drains (caller should dispose on unmount).
 */
export async function watchOsOpenedFiles(
  onOpen: OpenOsFileHandler,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => undefined;
  }

  const deliver = (paths: string[]) => {
    for (const path of paths) {
      if (!isSafePdfPath(path)) continue;
      onOpen(path, fileNameFromPath(path));
    }
  };

  try {
    const initial = await invoke<string[]>('take_opened_files');
    if (Array.isArray(initial) && initial.length > 0) {
      deliver(initial);
    }
  } catch {
    // Command missing in old builds / browser — ignore
  }

  try {
    return await listen<string[]>('open-files', (event) => {
      if (Array.isArray(event.payload)) {
        deliver(event.payload);
      }
    });
  } catch {
    return () => undefined;
  }
}
