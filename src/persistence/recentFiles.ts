import type { RecentFileEntry } from '../document/types.ts';

const STORAGE_KEY = 'pdf_editor:recent-files';
const MAX_RECENT = 12;

function readRaw(): RecentFileEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentEntry);
  } catch {
    return [];
  }
}

function isRecentEntry(value: unknown): value is RecentFileEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.path === 'string' &&
    typeof v.name === 'string' &&
    typeof v.openedAt === 'number'
  );
}

export function listRecentFiles(): RecentFileEntry[] {
  return readRaw().slice(0, MAX_RECENT);
}

export function addRecentFile(entry: Omit<RecentFileEntry, 'openedAt'> & {
  openedAt?: number;
}): RecentFileEntry[] {
  const next: RecentFileEntry = {
    path: entry.path,
    name: entry.name,
    openedAt: entry.openedAt ?? Date.now(),
  };
  const existing = readRaw().filter((f) => f.path !== next.path);
  const merged = [next, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function clearRecentFiles(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function removeRecentFile(path: string): RecentFileEntry[] {
  const merged = readRaw().filter((f) => f.path !== path);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}
