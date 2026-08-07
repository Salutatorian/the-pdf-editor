import { current } from 'immer';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuidv4 } from 'uuid';
import {
  applySnapshot,
  canRedo,
  canUndo,
  cloneData,
  createSnapshot,
} from './history.ts';
import type {
  AppMode,
  DocumentMeta,
  FormField,
  HistoryEntry,
  OverlayObject,
  PageRotation,
  RecentFileEntry,
  SaveStatus,
  SearchMatch,
  SmartFillSuggestion,
  ZoomMode,
} from './types.ts';
import {
  dedupeFormFields,
  filterSuggestionsAgainstFields,
  fieldsClash,
  suggestionToFormField,
} from '../forms/SmartFill.ts';
import {
  getHeldDocumentBytes,
  setHeldDocumentBytes,
} from './documentBytesHolder.ts';

const MAX_HISTORY = 50;

export type DocumentState = {
  documentBytes: Uint8Array | null;
  /** Bumps on every open so pdf.js reloads even if length matches. */
  documentGen: number;
  meta: DocumentMeta | null;
  mode: AppMode;
  currentPage: number;
  pageCount: number;
  zoom: number;
  zoomMode: ZoomMode;
  rotation: PageRotation;
  searchQuery: string;
  searchMatches: SearchMatch[];
  dirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  overlays: OverlayObject[];
  selectedIds: string[];
  formFields: FormField[];
  smartFillSuggestions: SmartFillSuggestion[];
  smartFillEnabled: boolean;
  showProperties: boolean;
  sidebarCollapsed: boolean;
  statusMessage: string;
  recentFiles: RecentFileEntry[];
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  setDocument: (
    bytes: Uint8Array,
    meta: DocumentMeta,
    formFields?: FormField[],
  ) => void;
  /** Replace PDF bytes in-place (organize/compress/unlock) without wiping edits. */
  replaceDocumentBytes: (bytes: Uint8Array, pageCount?: number) => void;
  clearDocument: () => void;
  setMode: (mode: AppMode) => void;
  setPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setZoomMode: (zoomMode: ZoomMode) => void;
  rotate: (delta?: 90 | -90) => void;
  setSearch: (query: string, matches?: SearchMatch[]) => void;
  setDirty: (dirty: boolean) => void;
  setSaveStatus: (status: SaveStatus, error?: string | null) => void;
  addOverlay: (overlay: Omit<OverlayObject, 'id'> & { id?: string }) => string;
  updateOverlay: (id: string, patch: Partial<OverlayObject>) => void;
  deleteOverlays: (ids: string[]) => void;
  duplicateOverlays: (ids: string[]) => string[];
  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  setFormValue: (fieldId: string, value: string) => void;
  setFormFields: (fields: FormField[]) => void;
  setSmartFillSuggestions: (suggestions: SmartFillSuggestion[]) => void;
  confirmSmartFill: (id: string) => void;
  rejectSmartFill: (id: string) => void;
  acceptAllSmartFill: () => number;
  upsertFormField: (field: FormField) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  setStatus: (message: string) => void;
  toggleSidebar: () => void;
  toggleProperties: () => void;
  setRecentFiles: (files: RecentFileEntry[]) => void;
};

function nextRotation(current: PageRotation, delta: 90 | -90): PageRotation {
  const order: PageRotation[] = [0, 90, 180, 270];
  const idx = order.indexOf(current);
  const next = (idx + (delta === 90 ? 1 : -1) + order.length) % order.length;
  return order[next]!;
}

function pushUndoEntry(state: {
  overlays: OverlayObject[];
  formFields: FormField[];
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}): void {
  // Unwrap immer drafts — snapshots must be plain JSON-safe objects
  state.undoStack.push(
    createSnapshot(current(state.overlays), current(state.formFields)),
  );
  if (state.undoStack.length > MAX_HISTORY) {
    state.undoStack.shift();
  }
  state.redoStack = [];
}

export const useDocumentStore = create<DocumentState>()(
  immer((set, get) => ({
    documentBytes: null,
    documentGen: 0,
    meta: null,
    mode: 'open',
    currentPage: 0,
    pageCount: 0,
    zoom: 1,
    zoomMode: 'fit-page',
    rotation: 0,
    searchQuery: '',
    searchMatches: [],
    dirty: false,
    saveStatus: 'idle',
    saveError: null,
    overlays: [],
    selectedIds: [],
    formFields: [],
    smartFillSuggestions: [],
    smartFillEnabled: true,
    showProperties: false,
    sidebarCollapsed: false,
    statusMessage: '',
    recentFiles: [],
    undoStack: [],
    redoStack: [],

    setDocument: (bytes, meta, formFields = []) => {
      const gen = setHeldDocumentBytes(bytes);
      set((state) => {
        // Read back the held copy — never store a live Immer-drafted buffer
        state.documentBytes = getHeldDocumentBytes();
        state.documentGen = gen;
        state.meta = meta;
        state.pageCount = meta.pageCount;
        state.currentPage = 0;
        state.mode = 'fill';
        state.zoom = 1;
        state.zoomMode = 'fit-page';
        state.overlays = [];
        state.selectedIds = [];
        state.formFields = dedupeFormFields(formFields);
        state.smartFillSuggestions = [];
        state.dirty = false;
        state.saveStatus = 'idle';
        state.saveError = null;
        state.undoStack = [];
        state.redoStack = [];
        state.rotation = 0;
        state.searchQuery = '';
        state.searchMatches = [];
        state.statusMessage = `Opened ${meta.fileName}`;
      });
    },

    replaceDocumentBytes: (bytes, pageCount) => {
      const gen = setHeldDocumentBytes(bytes);
      set((state) => {
        state.documentBytes = getHeldDocumentBytes();
        state.documentGen = gen;
        if (typeof pageCount === 'number') {
          state.pageCount = pageCount;
          if (state.meta) {
            state.meta = {
              ...state.meta,
              pageCount,
              fileSize: bytes.byteLength,
              lastModified: Date.now(),
            };
          }
        } else if (state.meta) {
          state.meta = {
            ...state.meta,
            fileSize: bytes.byteLength,
            lastModified: Date.now(),
          };
        }
        state.dirty = true;
      });
    },

    clearDocument: () => {
      const gen = setHeldDocumentBytes(null);
      set((state) => {
        state.documentBytes = null;
        state.documentGen = gen;
        state.meta = null;
        state.mode = 'open';
        state.currentPage = 0;
        state.pageCount = 0;
        state.zoom = 1;
        state.zoomMode = 'fit-page';
        state.overlays = [];
        state.selectedIds = [];
        state.formFields = [];
        state.smartFillSuggestions = [];
        state.dirty = false;
        state.saveStatus = 'idle';
        state.saveError = null;
        state.undoStack = [];
        state.redoStack = [];
        state.statusMessage = '';
      });
    },

    setMode: (mode) => {
      set((state) => {
        state.mode = mode;
      });
    },

    setPage: (page) => {
      set((state) => {
        const max = Math.max(0, state.pageCount - 1);
        state.currentPage = Math.min(Math.max(0, page), max);
      });
    },

    setZoom: (zoom) => {
      set((state) => {
        state.zoom = Math.min(5, Math.max(0.1, zoom));
        state.zoomMode = 'custom';
      });
    },

    setZoomMode: (zoomMode) => {
      set((state) => {
        state.zoomMode = zoomMode;
      });
    },

    rotate: (delta = 90) => {
      set((state) => {
        state.rotation = nextRotation(state.rotation, delta);
        state.dirty = true;
      });
    },

    setSearch: (query, matches = []) => {
      set((state) => {
        state.searchQuery = query;
        state.searchMatches = matches;
      });
    },

    setDirty: (dirty) => {
      set((state) => {
        state.dirty = dirty;
      });
    },

    setSaveStatus: (status, error = null) => {
      set((state) => {
        state.saveStatus = status;
        state.saveError = error;
        if (status === 'saved') {
          state.dirty = false;
        }
      });
    },

    addOverlay: (overlay) => {
      const id = overlay.id ?? uuidv4();
      set((state) => {
        pushUndoEntry(state);
        state.overlays.push({ ...overlay, id });
        state.selectedIds = [id];
        state.dirty = true;
      });
      return id;
    },

    updateOverlay: (id, patch) => {
      set((state) => {
        const idx = state.overlays.findIndex((o) => o.id === id);
        if (idx < 0) return;
        pushUndoEntry(state);
        const current = state.overlays[idx]!;
        state.overlays[idx] = { ...current, ...patch, id: current.id };
        state.dirty = true;
      });
    },

    deleteOverlays: (ids) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      set((state) => {
        pushUndoEntry(state);
        state.overlays = state.overlays.filter((o) => !idSet.has(o.id));
        state.selectedIds = state.selectedIds.filter((id) => !idSet.has(id));
        state.dirty = true;
      });
    },

    duplicateOverlays: (ids) => {
      const newIds: string[] = [];
      set((state) => {
        pushUndoEntry(state);
        const idSet = new Set(ids);
        const copies: OverlayObject[] = [];
        for (const overlay of state.overlays) {
          if (!idSet.has(overlay.id)) continue;
          const newId = uuidv4();
          newIds.push(newId);
          copies.push({
            ...cloneData(current(overlay)),
            id: newId,
            x: overlay.x + 12,
            y: overlay.y + 12,
            zIndex: overlay.zIndex + 1,
          });
        }
        state.overlays.push(...copies);
        state.selectedIds = newIds;
        state.dirty = true;
      });
      return newIds;
    },

    select: (ids, additive = false) => {
      set((state) => {
        if (additive) {
          const setIds = new Set(state.selectedIds);
          for (const id of ids) setIds.add(id);
          state.selectedIds = [...setIds];
        } else {
          state.selectedIds = [...ids];
        }
      });
    },

    clearSelection: () => {
      set((state) => {
        state.selectedIds = [];
      });
    },

    setFormValue: (fieldId, value) => {
      set((state) => {
        let field = state.formFields.find((f) => f.id === fieldId);
        if (!field) {
          // Race: Smart Fill confirm + first keystroke in same tick
          const suggestion = state.smartFillSuggestions.find(
            (s) => s.id === fieldId,
          );
          if (suggestion) {
            suggestion.confirmed = true;
            field = suggestionToFormField(suggestion);
            state.formFields.push(field);
          } else {
            return;
          }
        }
        if (field.value === value) return;
        pushUndoEntry(state);
        field.value = value;
        state.dirty = true;
      });
    },

    setFormFields: (fields) => {
      set((state) => {
        state.formFields = fields;
      });
    },

    setSmartFillSuggestions: (suggestions) => {
      set((state) => {
        state.smartFillSuggestions = suggestions;
      });
    },

    confirmSmartFill: (id) => {
      set((state) => {
        const suggestion = state.smartFillSuggestions.find((s) => s.id === id);
        if (!suggestion || suggestion.confirmed) return;
        const overlapsExisting = state.formFields.some(
          (f) =>
            f.pageIndex === suggestion.pageIndex &&
            fieldsClash(f.rect, suggestion.rect),
        );
        suggestion.confirmed = true;
        if (overlapsExisting) return;
        pushUndoEntry(state);
        const field = suggestionToFormField(suggestion);
        if (!state.formFields.some((f) => f.id === field.id)) {
          state.formFields.push(field);
        }
        state.formFields = dedupeFormFields(state.formFields);
        state.dirty = true;
        state.statusMessage = `Ready to type: ${field.placeholder ?? suggestion.kind}`;
      });
    },

    rejectSmartFill: (id) => {
      set((state) => {
        state.smartFillSuggestions = state.smartFillSuggestions.filter(
          (s) => s.id !== id,
        );
        state.statusMessage = 'Smart Fill suggestion dismissed';
      });
    },

    acceptAllSmartFill: () => {
      let count = 0;
      set((state) => {
        const before = state.formFields.length;
        const pending = filterSuggestionsAgainstFields(
          state.smartFillSuggestions.filter((s) => !s.confirmed),
          state.formFields,
        );
        for (const s of state.smartFillSuggestions) {
          s.confirmed = true;
        }
        if (pending.length === 0) {
          state.formFields = dedupeFormFields(state.formFields);
          return;
        }
        pushUndoEntry(state);
        for (const suggestion of pending) {
          const field = suggestionToFormField(suggestion);
          if (!state.formFields.some((f) => f.id === field.id)) {
            state.formFields.push(field);
          }
        }
        state.formFields = dedupeFormFields(state.formFields);
        count = Math.max(0, state.formFields.length - before);
        state.dirty = true;
        state.statusMessage =
          count > 0
            ? `Ready to fill · ${state.formFields.length} field(s) — typing saves to disk`
            : 'Form fields ready';
      });
      return count;
    },

    upsertFormField: (field) => {
      set((state) => {
        pushUndoEntry(state);
        const idx = state.formFields.findIndex((f) => f.id === field.id);
        if (idx >= 0) {
          state.formFields[idx] = field;
        } else {
          state.formFields.push(field);
        }
        state.dirty = true;
      });
    },

    pushHistory: () => {
      set((state) => {
        pushUndoEntry(state);
      });
    },

    undo: () => {
      if (!canUndo({ undoStack: get().undoStack, redoStack: get().redoStack })) {
        return;
      }
      set((state) => {
        const snapshot = createSnapshot(
          current(state.overlays),
          current(state.formFields),
        );
        const previous = state.undoStack.pop();
        if (!previous) return;
        state.redoStack.push(snapshot);
        // previous may still be an Immer proxy — applySnapshot clones safely
        const restored = applySnapshot(
          current(previous),
          current(state.formFields),
        );
        state.overlays = restored.overlays;
        state.formFields = restored.formFields;
        state.dirty = true;
        state.selectedIds = [];
      });
    },

    redo: () => {
      if (!canRedo({ undoStack: get().undoStack, redoStack: get().redoStack })) {
        return;
      }
      set((state) => {
        const snapshot = createSnapshot(
          current(state.overlays),
          current(state.formFields),
        );
        const next = state.redoStack.pop();
        if (!next) return;
        state.undoStack.push(snapshot);
        const restored = applySnapshot(
          current(next),
          current(state.formFields),
        );
        state.overlays = restored.overlays;
        state.formFields = restored.formFields;
        state.dirty = true;
        state.selectedIds = [];
      });
    },

    setStatus: (message) => {
      set((state) => {
        state.statusMessage = message;
      });
    },

    toggleSidebar: () => {
      set((state) => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
      });
    },

    toggleProperties: () => {
      set((state) => {
        state.showProperties = !state.showProperties;
      });
    },

    setRecentFiles: (files) => {
      set((state) => {
        state.recentFiles = files;
      });
    },
  })),
);
