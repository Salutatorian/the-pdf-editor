import { PDFDocument } from 'pdf-lib';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ErrorBoundary } from './app/ErrorBoundary.tsx';
import { AppShell, type StatusTone } from './app/AppShell.tsx';
import {
  TopToolbar,
  type AddTool,
} from './app/TopToolbar.tsx';
import type { AppMode } from './app/modes.ts';
import { useKeyboardShortcuts } from './app/shortcuts.ts';
import { useDocumentStore } from './document/documentStore.ts';
import type {
  DocumentMeta,
  FormField,
  OverlayKind,
  OverlayObject,
} from './document/types.ts';
import { canRedo, canUndo } from './document/history.ts';
import { loadAcroFormFields } from './forms/AcroFormLoader.ts';
import { FormOverlay, nextFormFieldId } from './forms/FormOverlay.tsx';
import {
  detectSmartFillSuggestions,
  type TextItemHint,
} from './forms/SmartFill.ts';
import {
  saveAs,
  verifiedSave,
  type SaveResult,
} from './export/SavePipeline.ts';
import { compressPdf } from './export/compressPdf.ts';
import { OverlayEditor } from './overlay/OverlayEditor.tsx';
import { nudgeDelta } from './overlay/alignment.ts';
import {
  deletePages,
  duplicatePage,
  extractPages,
  mergePdfs,
  reorderPages,
  rotatePages,
} from './organizer/PageOrganizer.ts';
import { OrganizePanel } from './organizer/OrganizePanel.tsx';
import {
  remapFieldsAfterDelete,
  remapFieldsAfterReorder,
  remapOverlaysAfterDelete,
  remapOverlaysAfterDuplicate,
  remapOverlaysAfterReorder,
} from './organizer/organizeDocument.ts';
import {
  compareByteHash,
  comparePageCounts,
} from './compare/CompareDocs.ts';
import {
  ComparePanel,
  type CompareResultView,
} from './compare/ComparePanel.tsx';
import { OcrPanel } from './ocr/OcrPanel.tsx';
import type { OcrTextItem } from './ocr/OcrService.ts';
import {
  isTauri,
  openPdfDialog,
  pickSavePath,
  readPdfFromPath,
  saveBytes,
} from './persistence/fileService.ts';
import { createSaveIO } from './persistence/tauriSaveIO.ts';
import {
  addRecentFile,
  listRecentFiles,
} from './persistence/recentFiles.ts';
import { clearDraft, saveDraft } from './persistence/drafts.ts';
import { protectPdf, unlockPdf } from './security/PdfSecurity.ts';
import {
  PasswordDialog,
  type PasswordDialogMode,
} from './security/PasswordDialog.tsx';
import {
  cleanupSignaturePng,
  saveSignature,
} from './signatures/SignatureEngine.ts';
import {
  SignaturePadDialog,
  type SignaturePadResult,
} from './signatures/SignaturePadDialog.tsx';
import { SaveConfirmModal } from './shared/ui/SaveConfirmModal.tsx';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { ThumbnailSidebar, type ThumbnailItem } from './viewer/ThumbnailSidebar.tsx';
import {
  PropertiesPanel,
  type PropertiesSelection,
} from './viewer/PropertiesPanel.tsx';
import { PdfViewer, jumpViewerToPage } from './viewer/PdfViewer.tsx';
import { usePdfDocument } from './viewer/usePdfDocument.ts';
import {
  jumpToSearchMatch,
  nextSearchMatch,
  runDocumentSearch,
} from './viewer/SearchBar.ts';
import { getPageTextContent } from './viewer/pdfjs.ts';
import './styles/viewer.css';

const AUTOSAVE_MS = 30_000;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fileToBytes(file: File): Promise<Uint8Array> {
  return file.arrayBuffer().then((buf) => new Uint8Array(buf));
}

type PendingSignature = {
  pageIndex: number;
  x: number;
  y: number;
  fieldId?: string;
};

function AppInner() {
  const store = useDocumentStore();
  const {
    documentBytes,
    meta,
    mode,
    currentPage,
    pageCount,
    zoom,
    zoomMode,
    rotation,
    searchQuery,
    searchMatches,
    dirty,
    saveStatus,
    saveError,
    overlays,
    selectedIds,
    formFields,
    smartFillSuggestions,
    showProperties,
    sidebarCollapsed,
    statusMessage,
    recentFiles,
    undoStack,
    redoStack,
  } = store;

  const [addTool, setAddTool] = useState<AddTool>('select');
  const [smartFillOn, setSmartFillOn] = useState(true);
  const [sigOpen, setSigOpen] = useState(false);
  const [pendingSig, setPendingSig] = useState<PendingSignature | null>(null);
  const [saveConfirm, setSaveConfirm] = useState<{
    open: boolean;
    info: {
      filename: string;
      location: string;
      fileSize: string;
      timestamp: string;
    };
  }>({
    open: false,
    info: { filename: '', location: '', fileSize: '', timestamp: '' },
  });
  const [focusedFieldId, setFocusedFieldId] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<ThumbnailItem[]>([]);
  const [organizeSelected, setOrganizeSelected] = useState<number[]>([]);
  const [passwordDialog, setPasswordDialog] = useState<{
    open: boolean;
    mode: PasswordDialogMode;
    error: string | null;
  }>({ open: false, mode: 'unlock', error: null });
  const [ocrOpen, setOcrOpen] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResultView | null>(
    null,
  );
  const searchCursor = useRef<(typeof searchMatches)[0] | null>(null);
  const saveIo = useMemo(() => createSaveIO(), []);

  const { doc, getPage, renderThumbnail, loading, error: pdfError } =
    usePdfDocument(documentBytes);

  useEffect(() => {
    store.setRecentFiles(listRecentFiles());
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!meta || !dirty) return;
    const id = window.setInterval(() => {
      saveDraft({
        documentKey: meta.path,
        documentName: meta.fileName,
        overlays: useDocumentStore.getState().overlays,
        formFields: useDocumentStore.getState().formFields,
      });
      store.setStatus('Draft autosaved');
    }, AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [meta, dirty]);

  useEffect(() => {
    let cancelled = false;
    async function loadThumbs(): Promise<void> {
      if (!doc || pageCount === 0) {
        setThumbs([]);
        return;
      }
      const items: ThumbnailItem[] = [];
      for (let i = 0; i < pageCount; i++) {
        const dataUrl = await renderThumbnail(i);
        if (cancelled) return;
        items.push({ pageIndex: i, dataUrl });
      }
      if (!cancelled) setThumbs(items);
    }
    void loadThumbs();
    return () => {
      cancelled = true;
    };
  }, [doc, pageCount, renderThumbnail]);

  const openBytes = useCallback(
    async (bytes: Uint8Array, path: string, name: string) => {
      const fields = await loadAcroFormFields(bytes);
      const metaDoc: DocumentMeta = {
        path,
        fileName: name,
        pageCount: 0,
        fileSize: bytes.byteLength,
        lastModified: Date.now(),
      };
      // pageCount filled via pdf-lib
      const pdf = await PDFDocument.load(bytes, {
        ignoreEncryption: true,
        updateMetadata: false,
      });
      metaDoc.pageCount = pdf.getPageCount();
      store.setDocument(bytes, metaDoc, fields);
      const recent = addRecentFile({ path, name });
      store.setRecentFiles(recent);
      setAddTool('select');
      setFocusedFieldId(null);
    },
    [store],
  );

  const handleOpen = useCallback(async () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    const opened = await openPdfDialog();
    if (!opened) return;
    await openBytes(opened.bytes, opened.path, opened.name);
  }, [dirty, openBytes]);

  const handleDropFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (dirty && !window.confirm('Discard unsaved changes?')) return;
      const bytes = await fileToBytes(file);
      await openBytes(bytes, file.name, file.name);
    },
    [dirty, openBytes],
  );

  const handleOpenRecent = useCallback(
    async (path: string, name: string) => {
      if (dirty && !window.confirm('Discard unsaved changes?')) return;
      try {
        if (isTauri()) {
          const bytes = await readPdfFromPath(path);
          await openBytes(bytes, path, name);
        } else {
          store.setStatus('Re-open recent files from disk in the desktop app');
          await handleOpen();
        }
      } catch (err) {
        store.setStatus(
          err instanceof Error ? err.message : 'Failed to open recent file',
        );
      }
    },
    [dirty, openBytes, handleOpen, store],
  );

  const applySaveResult = useCallback(
    (result: SaveResult, asSaveAs: boolean) => {
      if (result.success) {
        store.setSaveStatus('saved');
        store.setStatus(
          asSaveAs
            ? `Saved as ${result.path}`
            : `Saved ${result.path}`,
        );
        if (meta) {
          clearDraft(meta.path);
        }
        const filename =
          result.path.replace(/\\/g, '/').split('/').pop() ?? result.path;
        setSaveConfirm({
          open: true,
          info: {
            filename,
            location: result.path,
            fileSize: formatBytes(result.fileSize),
            timestamp: result.timestamp,
          },
        });
        // Refresh in-memory bytes from rebuilt export would require re-read;
        // mark clean via setSaveStatus('saved') already.
      } else {
        store.setSaveStatus('error', result.error);
        store.setStatus(`Save failed: ${result.error}`);
        store.setDirty(true);
      }
    },
    [store, meta],
  );

  const handleSave = useCallback(async () => {
    if (!documentBytes || !meta) return;
    store.setSaveStatus('saving');
    store.setStatus('Saving…');
    try {
      store.setSaveStatus('verifying');
      store.setStatus('Verifying…');
      const result = await verifiedSave({
        originalPath: meta.path,
        originalBytes: documentBytes,
        overlays,
        formFields,
        io: saveIo,
      });
      applySaveResult(result, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      store.setSaveStatus('error', message);
      store.setStatus(`Save failed: ${message}`);
      store.setDirty(true);
    }
  }, [
    documentBytes,
    meta,
    overlays,
    formFields,
    saveIo,
    store,
    applySaveResult,
  ]);

  const handleSaveAsFixed = useCallback(async () => {
    if (!documentBytes || !meta) return;
    const target = await pickSavePath(meta.fileName);
    if (!target) return;
    store.setSaveStatus('saving');
    store.setStatus('Saving As…');
    try {
      store.setSaveStatus('verifying');
      store.setStatus('Verifying…');
      const result = await saveAs({
        targetPath: target,
        originalBytes: documentBytes,
        overlays,
        formFields,
        io: saveIo,
      });
      applySaveResult(result, true);
      if (result.success) {
        const fileName =
          result.path.replace(/\\/g, '/').split('/').pop() ?? meta.fileName;
        useDocumentStore.setState((s) => {
          if (!s.meta) return;
          s.meta = {
            ...s.meta,
            path: result.path,
            fileName,
            fileSize: result.fileSize,
            lastModified: Date.now(),
          };
          s.dirty = false;
          s.saveStatus = 'saved';
        });
        addRecentFile({ path: result.path, name: fileName });
        store.setRecentFiles(listRecentFiles());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      store.setSaveStatus('error', message);
      store.setStatus(`Save As failed: ${message}`);
      store.setDirty(true);
    }
  }, [
    documentBytes,
    meta,
    overlays,
    formFields,
    saveIo,
    store,
    applySaveResult,
  ]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleSearchChange = useCallback(
    (query: string) => {
      store.setSearch(query, []);
    },
    [store],
  );

  const handleSearchSubmit = useCallback(async () => {
    const matches = await runDocumentSearch(doc, searchQuery);
    store.setSearch(searchQuery, matches);
    const next = nextSearchMatch(matches, searchCursor.current);
    searchCursor.current = next;
    jumpToSearchMatch(next ?? undefined);
  }, [doc, searchQuery, store]);

  const runSmartFill = useCallback(async () => {
    if (!doc) return;
    const all = [];
    for (let i = 0; i < doc.numPages; i++) {
      const page = await getPage(i);
      if (!page) continue;
      const viewport = page.getViewport({ scale: 1 });
      const { items } = await getPageTextContent(page);
      const hints: TextItemHint[] = [];
      for (const item of items) {
        if (!('str' in item)) continue;
        hints.push({
          str: item.str,
          transform: item.transform as number[],
          width: item.width,
          height: item.height,
        });
      }
      all.push(
        ...detectSmartFillSuggestions(
          viewport.width,
          viewport.height,
          i,
          hints,
        ),
      );
    }
    store.setSmartFillSuggestions(all);
    store.setStatus(`Smart Fill: ${all.length} suggestion(s)`);
  }, [doc, getPage, store]);

  const onSmartFillChange = useCallback(
    (enabled: boolean) => {
      setSmartFillOn(enabled);
      if (enabled) {
        void runSmartFill();
      } else {
        store.setSmartFillSuggestions([]);
      }
    },
    [runSmartFill, store],
  );

  const activeOverlayTool: OverlayKind | null = useMemo(() => {
    if (mode === 'sign' && addTool === 'signature') return 'signature';
    if (mode === 'add' && addTool !== 'select' && addTool !== 'hand') {
      return addTool;
    }
    return null;
  }, [mode, addTool]);

  const applyOrganizedDocument = useCallback(
    (
      newBytes: Uint8Array,
      nextOverlays: OverlayObject[],
      nextFields: FormField[],
      status: string,
    ) => {
      void PDFDocument.load(newBytes, {
        ignoreEncryption: true,
        updateMetadata: false,
      }).then((pdf) => {
        const nextPageCount = pdf.getPageCount();
        useDocumentStore.setState((s) => {
          if (!s.meta) return;
          s.documentBytes = newBytes;
          s.meta = {
            ...s.meta,
            pageCount: nextPageCount,
            fileSize: newBytes.byteLength,
            lastModified: Date.now(),
          };
          s.pageCount = nextPageCount;
          s.overlays = nextOverlays;
          s.formFields = nextFields;
          s.dirty = true;
          s.currentPage = Math.min(
            s.currentPage,
            Math.max(0, nextPageCount - 1),
          );
          s.selectedIds = [];
          s.smartFillSuggestions = [];
          s.undoStack = [];
          s.redoStack = [];
          s.statusMessage = status;
          s.mode = 'organize';
        });
        setOrganizeSelected([]);
      });
    },
    [],
  );

  const onModeChange = useCallback(
    (next: AppMode) => {
      if (next === 'open') {
        void handleOpen();
        return;
      }
      store.setMode(next);
      if (next === 'add') setAddTool('text');
      if (next === 'sign') setAddTool('signature');
      if (next === 'view' || next === 'organize') setAddTool('select');
      if (next === 'fill' && smartFillOn) {
        void runSmartFill();
      }
      if (next === 'organize') setOrganizeSelected([]);
    },
    [handleOpen, store, smartFillOn, runSmartFill],
  );

  const handleOrganizeReorder = useCallback(
    async (newOrder: number[]) => {
      if (!documentBytes) return;
      try {
        const next = await reorderPages(documentBytes, newOrder);
        applyOrganizedDocument(
          next,
          remapOverlaysAfterReorder(overlays, newOrder),
          remapFieldsAfterReorder(formFields, newOrder),
          'Pages reordered',
        );
      } catch (err) {
        store.setStatus(err instanceof Error ? err.message : String(err));
      }
    },
    [documentBytes, overlays, formFields, applyOrganizedDocument, store],
  );

  const handleOrganizeRotate = useCallback(
    async (indexes: number[], deg: 90 | 180 | 270) => {
      if (!documentBytes) return;
      try {
        const next = await rotatePages(documentBytes, indexes, deg);
        applyOrganizedDocument(
          next,
          overlays,
          formFields,
          `Rotated ${indexes.length} page(s)`,
        );
      } catch (err) {
        store.setStatus(err instanceof Error ? err.message : String(err));
      }
    },
    [documentBytes, overlays, formFields, applyOrganizedDocument, store],
  );

  const handleOrganizeDelete = useCallback(
    async (indexes: number[]) => {
      if (!documentBytes) return;
      try {
        const next = await deletePages(documentBytes, indexes);
        applyOrganizedDocument(
          next,
          remapOverlaysAfterDelete(overlays, indexes),
          remapFieldsAfterDelete(formFields, indexes),
          `Deleted ${indexes.length} page(s)`,
        );
      } catch (err) {
        store.setStatus(err instanceof Error ? err.message : String(err));
      }
    },
    [documentBytes, overlays, formFields, applyOrganizedDocument, store],
  );

  const handleOrganizeDuplicate = useCallback(
    async (pageIndex: number) => {
      if (!documentBytes) return;
      try {
        const next = await duplicatePage(documentBytes, pageIndex);
        applyOrganizedDocument(
          next,
          remapOverlaysAfterDuplicate(overlays, pageIndex),
          formFields.map((f) =>
            f.pageIndex > pageIndex
              ? { ...f, pageIndex: f.pageIndex + 1 }
              : f,
          ),
          `Duplicated page ${pageIndex + 1}`,
        );
      } catch (err) {
        store.setStatus(err instanceof Error ? err.message : String(err));
      }
    },
    [documentBytes, overlays, formFields, applyOrganizedDocument, store],
  );

  const handleOrganizeExtract = useCallback(
    async (indexes: number[]) => {
      if (!documentBytes || !meta) return;
      try {
        const extracted = await extractPages(documentBytes, indexes);
        const target = await pickSavePath(
          meta.fileName.replace(/\.pdf$/i, '') + '-extract.pdf',
        );
        if (!target) return;
        await saveBytes(target, extracted);
        store.setStatus(`Extracted ${indexes.length} page(s) → ${target}`);
      } catch (err) {
        store.setStatus(err instanceof Error ? err.message : String(err));
      }
    },
    [documentBytes, meta, store],
  );

  const handleOrganizeMerge = useCallback(async () => {
    if (!documentBytes) return;
    const opened = await openPdfDialog();
    if (!opened) return;
    try {
      const next = await mergePdfs([documentBytes, opened.bytes]);
      applyOrganizedDocument(
        next,
        overlays,
        formFields,
        `Merged with ${opened.name}`,
      );
    } catch (err) {
      store.setStatus(err instanceof Error ? err.message : String(err));
    }
  }, [documentBytes, overlays, formFields, applyOrganizedDocument, store]);

  const handleCompress = useCallback(async () => {
    if (!documentBytes) return;
    try {
      const result = await compressPdf(documentBytes);
      useDocumentStore.setState((s) => {
        if (!s.meta) return;
        s.documentBytes = result.bytes;
        s.meta = {
          ...s.meta,
          fileSize: result.after,
          lastModified: Date.now(),
        };
        s.dirty = true;
        s.statusMessage = `Compressed ${formatBytes(result.before)} → ${formatBytes(result.after)}`;
      });
    } catch (err) {
      store.setStatus(err instanceof Error ? err.message : String(err));
    }
  }, [documentBytes, store]);

  const handleCompare = useCallback(async () => {
    if (!documentBytes) return;
    const opened = await openPdfDialog();
    if (!opened) return;
    try {
      const [pageCounts, hashes] = await Promise.all([
        comparePageCounts(documentBytes, opened.bytes),
        compareByteHash(documentBytes, opened.bytes),
      ]);
      setCompareResult({ pageCounts, hashes, otherName: opened.name });
      store.setStatus(
        hashes.equal
          ? `Compare: identical to ${opened.name}`
          : `Compare: differs from ${opened.name}`,
      );
    } catch (err) {
      store.setStatus(err instanceof Error ? err.message : String(err));
    }
  }, [documentBytes, store]);

  const handlePasswordSubmit = useCallback(
    async (password: string, ownerPassword?: string) => {
      if (!documentBytes) return;
      try {
        if (passwordDialog.mode === 'unlock') {
          const next = await unlockPdf(documentBytes, password);
          useDocumentStore.setState((s) => {
            if (!s.meta) return;
            s.documentBytes = next;
            s.meta = {
              ...s.meta,
              fileSize: next.byteLength,
              lastModified: Date.now(),
            };
            s.dirty = true;
            s.statusMessage = 'PDF unlocked (encryption stripped if present)';
          });
        } else {
          const next = await protectPdf(
            documentBytes,
            password,
            ownerPassword,
          );
          useDocumentStore.setState((s) => {
            if (!s.meta) return;
            s.documentBytes = next;
            s.meta = {
              ...s.meta,
              fileSize: next.byteLength,
              lastModified: Date.now(),
            };
            s.dirty = true;
            s.statusMessage = 'PDF protected';
          });
        }
        setPasswordDialog({ open: false, mode: 'unlock', error: null });
      } catch (err) {
        setPasswordDialog((d) => ({
          ...d,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [documentBytes, passwordDialog.mode],
  );

  const handleOcrSuggestions = useCallback(
    (items: OcrTextItem[], pageWidth: number, pageHeight: number) => {
      const hints: TextItemHint[] = items.map((item) => ({
        str: item.str,
        transform: item.transform,
        width: item.width,
        height: item.height,
      }));
      const suggestions = detectSmartFillSuggestions(
        pageWidth,
        pageHeight,
        currentPage,
        hints,
      );
      store.setSmartFillSuggestions(suggestions);
      store.setMode('fill');
      store.setStatus(
        `OCR → Smart Fill: ${suggestions.length} suggestion(s) (PDF unchanged)`,
      );
    },
    [currentPage, store],
  );

  const openSignatureAt = useCallback(
    (at: PendingSignature) => {
      setPendingSig(at);
      setSigOpen(true);
    },
    [],
  );

  const onSignatureSaved = useCallback(
    async (result: SignaturePadResult) => {
      let dataUrl = result.dataUrl;
      if (result.cleanup) {
        try {
          dataUrl = await cleanupSignaturePng(dataUrl);
        } catch {
          // keep original
        }
      }
      let signatureId: string | undefined;
      if (result.saveToLibrary) {
        const saved = saveSignature({
          name: result.name ?? 'Signature',
          source:
            result.source === 'draw'
              ? 'drawn'
              : result.source === 'type'
                ? 'typed'
                : 'imported',
          dataUrl,
        });
        signatureId = saved.id;
      }
      const place = pendingSig;
      setSigOpen(false);
      setPendingSig(null);
      if (!place) return;

      if (place.fieldId) {
        store.setFormValue(place.fieldId, dataUrl);
      }
      store.addOverlay({
        pageIndex: place.pageIndex,
        kind: 'signature',
        x: place.x,
        y: place.y,
        width: 200,
        height: 60,
        rotation: 0,
        zIndex: overlays.length + 1,
        imageDataUrl: dataUrl,
        signatureId,
      });
    },
    [pendingSig, store, overlays.length],
  );

  const selectedOverlay = useMemo(
    () => overlays.find((o) => o.id === selectedIds[0]) ?? null,
    [overlays, selectedIds],
  );

  const panelSelection: PropertiesSelection | null = useMemo(() => {
    if (!selectedOverlay) return null;
    if (selectedOverlay.kind === 'text' || selectedOverlay.kind === 'date' || selectedOverlay.kind === 'initials') {
      return {
        kind: 'text',
        x: selectedOverlay.x,
        y: selectedOverlay.y,
        width: selectedOverlay.width,
        height: selectedOverlay.height,
        rotation: selectedOverlay.rotation,
        content: selectedOverlay.text ?? '',
        fontSize: selectedOverlay.fontSize,
      };
    }
    if (selectedOverlay.kind === 'signature') {
      return {
        kind: 'signature',
        x: selectedOverlay.x,
        y: selectedOverlay.y,
        width: selectedOverlay.width,
        height: selectedOverlay.height,
        rotation: selectedOverlay.rotation,
        label: 'Visual signature',
      };
    }
    return {
      kind: selectedOverlay.kind === 'image' ? 'image' : 'annotation',
      x: selectedOverlay.x,
      y: selectedOverlay.y,
      width: selectedOverlay.width,
      height: selectedOverlay.height,
      rotation: selectedOverlay.rotation,
    };
  }, [selectedOverlay]);

  const onPropertiesChange = useCallback(
    (patch: Partial<PropertiesSelection>) => {
      const id = selectedIds[0];
      if (!id || !selectedOverlay) return;
      const overlayPatch: Partial<OverlayObject> = {};
      if (patch.x !== undefined) overlayPatch.x = patch.x;
      if (patch.y !== undefined) overlayPatch.y = patch.y;
      if (patch.width !== undefined) overlayPatch.width = patch.width;
      if (patch.height !== undefined) overlayPatch.height = patch.height;
      if (patch.rotation !== undefined) overlayPatch.rotation = patch.rotation;
      if (patch.kind === 'text' || selectedOverlay.kind === 'text') {
        if ('content' in patch && patch.content !== undefined) {
          overlayPatch.text = patch.content;
        }
        if ('fontSize' in patch && patch.fontSize !== undefined) {
          overlayPatch.fontSize = patch.fontSize;
        }
      }
      store.updateOverlay(id, overlayPatch);
    },
    [selectedIds, selectedOverlay, store],
  );

  useKeyboardShortcuts(
    {
      open: () => void handleOpen(),
      save: () => void handleSave(),
      saveAs: () => void handleSaveAsFixed(),
      print: handlePrint,
      search: () => {
        const input = document.querySelector<HTMLInputElement>(
          '.toolbar__search',
        );
        input?.focus();
        input?.select();
      },
      undo: () => store.undo(),
      redo: () => store.redo(),
      delete: () => store.deleteOverlays(selectedIds),
      duplicate: () => store.duplicateOverlays(selectedIds),
      clearSelection: () => store.clearSelection(),
      nudgeLeft: (e) => {
        const d = nudgeDelta('ArrowLeft', e.shiftKey);
        for (const id of selectedIds) {
          const o = overlays.find((x) => x.id === id);
          if (o) store.updateOverlay(id, { x: o.x + d.dx, y: o.y + d.dy });
        }
      },
      nudgeRight: (e) => {
        const d = nudgeDelta('ArrowRight', e.shiftKey);
        for (const id of selectedIds) {
          const o = overlays.find((x) => x.id === id);
          if (o) store.updateOverlay(id, { x: o.x + d.dx, y: o.y + d.dy });
        }
      },
      nudgeUp: (e) => {
        const d = nudgeDelta('ArrowUp', e.shiftKey);
        for (const id of selectedIds) {
          const o = overlays.find((x) => x.id === id);
          if (o) store.updateOverlay(id, { x: o.x + d.dx, y: o.y + d.dy });
        }
      },
      nudgeDown: (e) => {
        const d = nudgeDelta('ArrowDown', e.shiftKey);
        for (const id of selectedIds) {
          const o = overlays.find((x) => x.id === id);
          if (o) store.updateOverlay(id, { x: o.x + d.dx, y: o.y + d.dy });
        }
      },
      zoomFitPage: () => store.setZoomMode('fit-page'),
      zoomFitWidth: () => store.setZoomMode('fit-width'),
      formTab: () => {
        const next = nextFormFieldId(formFields, focusedFieldId, 1);
        setFocusedFieldId(next);
        if (next) {
          const field = formFields.find((f) => f.id === next);
          if (field) {
            store.setPage(field.pageIndex);
            jumpViewerToPage(field.pageIndex);
          }
        }
      },
      formShiftTab: () => {
        const next = nextFormFieldId(formFields, focusedFieldId, -1);
        setFocusedFieldId(next);
        if (next) {
          const field = formFields.find((f) => f.id === next);
          if (field) {
            store.setPage(field.pageIndex);
            jumpViewerToPage(field.pageIndex);
          }
        }
      },
    },
    { formNavEnabled: mode === 'fill', enabled: true },
  );

  const statusTone: StatusTone =
    saveStatus === 'error'
      ? 'error'
      : saveStatus === 'saved'
        ? 'success'
        : saveStatus === 'saving' || saveStatus === 'verifying'
          ? 'warning'
          : 'default';

  const statusText: ReactNode =
    saveStatus === 'error' && saveError
      ? saveError
      : pdfError
        ? pdfError
        : loading
          ? 'Loading PDF…'
          : statusMessage || 'Ready';

  const emptyState = !documentBytes;

  const toolbar = (
    <TopToolbar
      mode={mode === 'open' && documentBytes ? 'view' : (mode as AppMode)}
      onModeChange={onModeChange}
      dirty={dirty}
      canUndo={canUndo({ undoStack, redoStack })}
      canRedo={canRedo({ undoStack, redoStack })}
      zoomPercent={zoom * 100}
      searchQuery={searchQuery}
      smartFill={smartFillOn}
      addTool={addTool}
      hasDocument={Boolean(documentBytes)}
      onOpen={() => void handleOpen()}
      onSave={() => void handleSave()}
      onSaveAs={() => void handleSaveAsFixed()}
      onUndo={() => store.undo()}
      onRedo={() => store.redo()}
      onZoomIn={() => store.setZoom(zoom * 1.15)}
      onZoomOut={() => store.setZoom(zoom / 1.15)}
      onFitWidth={() => store.setZoomMode('fit-width')}
      onFitPage={() => store.setZoomMode('fit-page')}
      onRotate={() => store.rotate(90)}
      onPrint={handlePrint}
      onSearchChange={handleSearchChange}
      onSearchSubmit={() => void handleSearchSubmit()}
      onSmartFillChange={onSmartFillChange}
      onAddToolChange={setAddTool}
      onCompress={() => void handleCompress()}
      onProtect={() =>
        setPasswordDialog({ open: true, mode: 'protect', error: null })
      }
      onUnlock={() =>
        setPasswordDialog({ open: true, mode: 'unlock', error: null })
      }
      onCompare={() => void handleCompare()}
      onOcr={() => setOcrOpen(true)}
    />
  );

  return (
    <>
      <AppShell
        toolbar={toolbar}
        sidebar={
          emptyState ? null : (
            <ThumbnailSidebar
              pages={thumbs}
              currentPage={currentPage}
              onPageSelect={(i) => {
                store.setPage(i);
                jumpViewerToPage(i);
              }}
            />
          )
        }
        properties={
          emptyState || !showProperties ? null : (
            <PropertiesPanel
              selection={panelSelection}
              onChange={onPropertiesChange}
            />
          )
        }
        statusMessage={statusText}
        statusTone={statusTone}
        pageLabel={
          emptyState ? undefined : `Page ${currentPage + 1} / ${pageCount}`
        }
        zoomLabel={emptyState ? undefined : `${Math.round(zoom * 100)}%`}
        statusMeta={
          saveStatus === 'error' ? (
            <Button variant="ghost" size="sm" onClick={() => void handleSaveAsFixed()}>
              Save As…
            </Button>
          ) : null
        }
        sidebarCollapsed={emptyState || sidebarCollapsed}
        propertiesCollapsed={emptyState || !showProperties}
        onDropFiles={(files) => void handleDropFiles(files)}
      >
        {emptyState ? (
          <EmptyState
            recentFiles={recentFiles}
            onOpen={() => void handleOpen()}
            onOpenRecent={(path, name) => void handleOpenRecent(path, name)}
            onFileInput={(file) => void handleDropFiles([file])}
          />
        ) : mode === 'organize' ? (
          <OrganizePanel
            pageCount={pageCount}
            currentPage={currentPage}
            thumbnails={thumbs}
            selectedPages={organizeSelected}
            onSelectPages={setOrganizeSelected}
            onApplyReorder={(order) => void handleOrganizeReorder(order)}
            onRotate={(indexes, deg) => void handleOrganizeRotate(indexes, deg)}
            onDelete={(indexes) => void handleOrganizeDelete(indexes)}
            onDuplicate={(i) => void handleOrganizeDuplicate(i)}
            onExtract={(indexes) => void handleOrganizeExtract(indexes)}
            onMergeRequest={() => void handleOrganizeMerge()}
            onJump={(i) => {
              store.setPage(i);
              jumpViewerToPage(i);
            }}
          />
        ) : (
          <PdfViewer
            doc={doc}
            pageCount={pageCount}
            currentPage={currentPage}
            onPageChange={(p) => store.setPage(p)}
            zoom={zoom}
            zoomMode={zoomMode}
            onZoomChange={(z) => {
              if (zoomMode === 'custom') store.setZoom(z);
              else {
                useDocumentStore.setState((s) => {
                  s.zoom = z;
                });
              }
            }}
            rotation={rotation}
            searchQuery={searchQuery}
            getPage={getPage}
            renderOverlay={({ pageIndex, scale, pageWidth, pageHeight }) => (
              <>
                <OverlayEditor
                  pageIndex={pageIndex}
                  width={pageWidth}
                  height={pageHeight}
                  scale={scale}
                  overlays={overlays}
                  selectedIds={selectedIds}
                  activeTool={
                    mode === 'add' || mode === 'sign' ? activeOverlayTool : null
                  }
                  interactive={mode === 'add' || mode === 'sign'}
                  onSelect={(ids, additive) => store.select(ids, additive)}
                  onAdd={(o) => store.addOverlay(o)}
                  onUpdate={(id, patch) => store.updateOverlay(id, patch)}
                  onRequestSignature={(at) =>
                    openSignatureAt({
                      pageIndex,
                      x: at.x,
                      y: at.y,
                    })
                  }
                />
                <FormOverlay
                  pageIndex={pageIndex}
                  scale={scale}
                  pageWidth={pageWidth}
                  pageHeight={pageHeight}
                  fields={formFields}
                  suggestions={smartFillSuggestions}
                  smartFillEnabled={smartFillOn && mode === 'fill'}
                  active={mode === 'fill'}
                  onFieldChange={(id, value) => store.setFormValue(id, value)}
                  onConfirmSuggestion={(id) => store.confirmSmartFill(id)}
                  onRejectSuggestion={(id) => store.rejectSmartFill(id)}
                  onCreateFromSuggestion={(o) => store.addOverlay(o)}
                  onSignatureField={(field) =>
                    openSignatureAt({
                      pageIndex: field.pageIndex,
                      x: field.rect.x,
                      y: field.rect.y,
                      fieldId: field.id,
                    })
                  }
                  focusedFieldId={focusedFieldId}
                  onFocusedFieldChange={setFocusedFieldId}
                />
              </>
            )}
          />
        )}
      </AppShell>

      <SignaturePadDialog
        open={sigOpen}
        onClose={() => {
          setSigOpen(false);
          setPendingSig(null);
        }}
        onSave={(r) => void onSignatureSaved(r)}
      />

      <SaveConfirmModal
        open={saveConfirm.open}
        info={saveConfirm.info}
        onConfirm={() => setSaveConfirm((s) => ({ ...s, open: false }))}
        onCancel={() => setSaveConfirm((s) => ({ ...s, open: false }))}
      />

      <PasswordDialog
        open={passwordDialog.open}
        mode={passwordDialog.mode}
        error={passwordDialog.error}
        onClose={() =>
          setPasswordDialog({ open: false, mode: 'unlock', error: null })
        }
        onSubmit={(pw, owner) => void handlePasswordSubmit(pw, owner)}
      />

      {!emptyState ? (
        <OcrPanel
          open={ocrOpen}
          pageIndex={currentPage}
          getPage={getPage}
          onSuggestions={handleOcrSuggestions}
          onClose={() => setOcrOpen(false)}
        />
      ) : null}

      {compareResult ? (
        <ComparePanel
          result={compareResult}
          onClose={() => setCompareResult(null)}
        />
      ) : null}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
