import type { FormField, OverlayObject } from '../document/types.ts';

const DRAFT_PREFIX = 'pdf_editor:draft:';
const INDEX_KEY = 'pdf_editor:draft-index';

export type DraftPayload = {
  documentKey: string;
  documentName: string;
  overlays: OverlayObject[];
  formFields: FormField[];
  savedAt: number;
};

export type RecoveryDraftSummary = {
  documentKey: string;
  documentName: string;
  savedAt: number;
};

function draftKey(documentKey: string): string {
  return `${DRAFT_PREFIX}${encodeURIComponent(documentKey)}`;
}

function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((k): k is string => typeof k === 'string');
  } catch {
    return [];
  }
}

function writeIndex(keys: string[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(keys));
}

function isDraftPayload(value: unknown): value is DraftPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.documentKey === 'string' &&
    typeof v.documentName === 'string' &&
    Array.isArray(v.overlays) &&
    Array.isArray(v.formFields) &&
    typeof v.savedAt === 'number'
  );
}

export function saveDraft(args: {
  documentKey: string;
  documentName: string;
  overlays: OverlayObject[];
  formFields: FormField[];
}): DraftPayload {
  const payload: DraftPayload = {
    documentKey: args.documentKey,
    documentName: args.documentName,
    overlays: structuredClone(args.overlays),
    formFields: structuredClone(args.formFields),
    savedAt: Date.now(),
  };
  localStorage.setItem(draftKey(args.documentKey), JSON.stringify(payload));
  const index = readIndex().filter((k) => k !== args.documentKey);
  index.unshift(args.documentKey);
  writeIndex(index);
  return payload;
}

export function loadDraft(documentKey: string): DraftPayload | null {
  try {
    const raw = localStorage.getItem(draftKey(documentKey));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraftPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDraft(documentKey: string): void {
  localStorage.removeItem(draftKey(documentKey));
  writeIndex(readIndex().filter((k) => k !== documentKey));
}

export function listRecoveryDrafts(): RecoveryDraftSummary[] {
  const summaries: RecoveryDraftSummary[] = [];
  for (const key of readIndex()) {
    const draft = loadDraft(key);
    if (!draft) continue;
    summaries.push({
      documentKey: draft.documentKey,
      documentName: draft.documentName,
      savedAt: draft.savedAt,
    });
  }
  return summaries.sort((a, b) => b.savedAt - a.savedAt);
}
