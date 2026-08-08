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
import { ShortcutsHelpDialog } from './app/ShortcutsHelpDialog.tsx';
import { SettingsDialog } from './settings/SettingsDialog.tsx';
import { UpdateToast } from './settings/UpdateToast.tsx';
import { WhatsNewDialog } from './settings/WhatsNewDialog.tsx';
import { APP_VERSION } from './settings/appVersion.ts';
import {
  loadAppSettings,
  patchAppSettings,
} from './settings/appSettings.ts';
import {
  getTheme,
  setTheme,
  type ThemeMode,
} from './settings/theme.ts';
import {
  checkForAppUpdate,
  installAppUpdate,
  type UpdateInfo,
  type UpdateProgress,
} from './settings/updateService.ts';
import { setOpenAtLoginEnabled } from './settings/autostart.ts';
import { restoreUiAfterNativeDialog } from './settings/windowActions.ts';
import { useDocumentStore } from './document/documentStore.ts';
import { withSaveLock } from './persistence/saveLock.ts';
import { assertSafePdfBytes } from './persistence/pdfSafety.ts';
import type {
  DocumentMeta,
  FormField,
  OverlayKind,
  OverlayObject,
} from './document/types.ts';
import { canRedo, canUndo } from './document/history.ts';
import { loadAcroFormFields } from './forms/AcroFormLoader.ts';
import { syncFormFieldRectsFromPdfJs } from './forms/syncFormFieldRectsFromPdfJs.ts';
import { FormOverlay } from './forms/FormOverlay.tsx';
import { nextFormFieldId } from './forms/formNav.ts';
import {
  detectSmartFillSuggestions,
  filterSuggestionsAgainstFields,
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
  clearRecentFiles,
  listRecentFiles,
  removeRecentFile,
} from './persistence/recentFiles.ts';
import { clearDraft, saveDraft } from './persistence/drafts.ts';
import {
  loadAnnotationLayer,
  saveAnnotationLayer,
} from './persistence/annotationLayer.ts';
import { getBasePdf, putBasePdf } from './persistence/basePdfCache.ts';
import { protectPdf, unlockPdf } from './security/PdfSecurity.ts';
import {
  PasswordDialog,
  type PasswordDialogMode,
} from './security/PasswordDialog.tsx';
import {
  cleanupSignaturePng,
  saveSignature,
  toTransparentSignatureInk,
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

/** Crash backup to localStorage — every edit, not a long interval. */
const DRAFT_SAVE_MS = 250;
/** Write the real PDF on disk after typing pauses (Tauri only). */
const LIVE_DISK_SAVE_MS = 500;

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
    documentGen,
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme());
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(
    null,
  );
  const [whatsNewVersion, setWhatsNewVersion] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResultView | null>(
    null,
  );
  const searchCursor = useRef<(typeof searchMatches)[0] | null>(null);
  const saveIo = useMemo(() => createSaveIO(), []);
  const liveSaveInFlight = useRef(false);
  const liveSavePending = useRef(false);
  /** Bumps on every Open so in-flight autosave / Smart Fill can't touch the new doc. */
  const docSessionRef = useRef(0);
  const openingRef = useRef(false);
  /** Path we already auto-activated fillables for (avoids re-running on every render). */
  const autoFillPathRef = useRef<string | null>(null);

  const {
    doc,
    pageCount: pdfjsPageCount,
    getPage,
    renderThumbnail,
    loading,
    error: pdfError,
  } = usePdfDocument(documentGen);

  const viewerPageCount = pdfjsPageCount > 0 ? pdfjsPageCount : pageCount;
  const syncedRectsForGen = useRef<number | null>(null);

  /** Lock fillable positions to pdf.js annotation geometry (survives zoom). */
  useEffect(() => {
    if (!doc || !documentGen) return;
    if (syncedRectsForGen.current === documentGen) return;
    const fields = useDocumentStore.getState().formFields;
    if (fields.length === 0) {
      // Don't mark synced — fields may arrive with the same gen shortly after
      return;
    }
    const session = docSessionRef.current;
    const snapshotIds = new Set(fields.map((f) => f.id));
    let cancelled = false;
    void (async () => {
      try {
        const synced = await syncFormFieldRectsFromPdfJs(doc, fields);
        if (cancelled || docSessionRef.current !== session) return;
        const live = useDocumentStore.getState().formFields;
        // Merge: keep live values / newly added fields; only take rects from sync
        const byId = new Map(synced.map((f) => [f.id, f]));
        const merged = live.map((f) => {
          const s = byId.get(f.id);
          if (!s) return f;
          return { ...f, rect: s.rect, pageIndex: s.pageIndex };
        });
        // Include synced fields that were in the snapshot but somehow dropped
        for (const s of synced) {
          if (!merged.some((f) => f.id === s.id) && snapshotIds.has(s.id)) {
            const liveMatch = live.find((f) => f.id === s.id);
            merged.push(liveMatch ? { ...s, value: liveMatch.value } : s);
          }
        }
        syncedRectsForGen.current = documentGen;
        store.setFormFields(merged);
        if (useDocumentStore.getState().mode === 'fill') {
          store.setStatus(
            `Ready to fill · ${merged.length} field(s) — aligned to page`,
          );
        }
      } catch (err) {
        console.error('Field rect sync failed', err);
        if (docSessionRef.current === session) {
          syncedRectsForGen.current = documentGen;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, documentGen, formFields.length, store]);

  const hasDiskPath = Boolean(
    meta?.path &&
      (meta.path.includes('/') || meta.path.includes('\\')) &&
      isTauri(),
  );

  useEffect(() => {
    store.setRecentFiles(listRecentFiles());
  }, []);

  /** Detect upgrades → What's New once; sync launch-at-login (default off). */
  useEffect(() => {
    const prefs = loadAppSettings();
    const previous = prefs.lastLaunchedVersion;
    const shouldShowWhatsNew =
      Boolean(previous) &&
      previous !== APP_VERSION &&
      prefs.lastSeenChangelogVersion !== APP_VERSION;

    if (shouldShowWhatsNew) {
      setWhatsNewVersion(APP_VERSION);
    }

    patchAppSettings({ lastLaunchedVersion: APP_VERSION });

    // Never enable on first run — only apply when the user turned it on
    if (prefs.openAtLogin) {
      void setOpenAtLoginEnabled(true);
    } else {
      void setOpenAtLoginEnabled(false);
    }

    let cancelled = false;
    void (async () => {
      const info = await checkForAppUpdate();
      if (cancelled || !info) return;
      setUpdateInfo(info);
      if (prefs.dismissedUpdateVersion !== info.version) {
        setShowUpdateToast(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismissWhatsNew = useCallback(() => {
    patchAppSettings({ lastSeenChangelogVersion: APP_VERSION });
    setWhatsNewVersion(null);
  }, []);

  const onUpdateToastCancel = useCallback(() => {
    if (updateInstalling) return;
    if (updateInfo) {
      patchAppSettings({ dismissedUpdateVersion: updateInfo.version });
    }
    setShowUpdateToast(false);
  }, [updateInfo, updateInstalling]);

  const onUpdateToastConfirm = useCallback(() => {
    if (!updateInfo || updateInstalling) return;
    setUpdateInstalling(true);
    setUpdateProgress(null);
    void (async () => {
      const result = await installAppUpdate(updateInfo, setUpdateProgress);
      if (result === 'opened-browser') {
        setUpdateInstalling(false);
        setUpdateProgress(null);
        setShowUpdateToast(false);
      }
      // 'installed' relaunches — no need to reset UI
    })();
  }, [updateInfo, updateInstalling]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const persistWorkingEdits = useCallback(
    async (path: string, baseBytes: Uint8Array) => {
      if (!(path.includes('/') || path.includes('\\'))) return;
      const state = useDocumentStore.getState();
      saveAnnotationLayer({
        path,
        overlays: state.overlays,
        formFields: state.formFields,
      });
      await putBasePdf(path, baseBytes);
    },
    [],
  );

  /** Instant local draft backup on every edit (survives crash even if disk save lags). */
  useEffect(() => {
    if (!meta || !dirty) return;
    const id = window.setTimeout(() => {
      saveDraft({
        documentKey: meta.path,
        documentName: meta.fileName,
        overlays: useDocumentStore.getState().overlays,
        formFields: useDocumentStore.getState().formFields,
      });
    }, DRAFT_SAVE_MS);
    return () => window.clearTimeout(id);
  }, [meta, dirty, overlays, formFields]);

  /**
   * Live disk save: every keystroke (debounced) writes the real PDF file.
   * No confirmation modal — silent status only. Tauri + real path required.
   */
  useEffect(() => {
    if (!hasDiskPath || !documentBytes || !meta || !dirty) return;

    const sessionAtSchedule = docSessionRef.current;
    const pathAtSchedule = meta.path;

    const id = window.setTimeout(() => {
      void (async () => {
        if (liveSaveInFlight.current) {
          liveSavePending.current = true;
          return;
        }
        liveSaveInFlight.current = true;
        try {
          do {
            liveSavePending.current = false;
            // User opened a different PDF — abandon this save loop
            if (docSessionRef.current !== sessionAtSchedule) break;

            const state = useDocumentStore.getState();
            if (!state.meta || !state.documentBytes || !state.dirty) break;
            // Never write the previous file's edits onto a newly opened path
            if (state.meta.path !== pathAtSchedule) break;

            const savedOverlays = state.overlays;
            const savedFields = state.formFields;
            const savePath = state.meta.path;
            const saveBytes = state.documentBytes;

            store.setSaveStatus('saving');
            store.setStatus('Saving as you type…');
            const result = await withSaveLock(() =>
              verifiedSave({
                originalPath: savePath,
                originalBytes: saveBytes,
                overlays: savedOverlays,
                formFields: savedFields,
                io: saveIo,
              }),
            );

            if (docSessionRef.current !== sessionAtSchedule) break;
            const now = useDocumentStore.getState();
            if (now.meta?.path !== savePath) break;

            if (result.success) {
              const drifted =
                JSON.stringify(now.formFields) !==
                  JSON.stringify(savedFields) ||
                JSON.stringify(now.overlays) !== JSON.stringify(savedOverlays);
              if (drifted) {
                store.setSaveStatus('idle');
                store.setDirty(true);
                liveSavePending.current = true;
                store.setStatus('Saving as you type…');
              } else {
                store.setSaveStatus('saved');
                store.setStatus(
                  `Written into the PDF file · reopen in Chrome/Edge/Preview to see your wording · ${new Date().toLocaleTimeString()}`,
                );
                clearDraft(savePath);
                void persistWorkingEdits(savePath, saveBytes);
              }
            } else {
              store.setSaveStatus('error', result.error);
              store.setStatus(
                `Autosave failed — draft kept. ${result.error ?? ''}`.trim(),
              );
              store.setDirty(true);
            }
          } while (
            liveSavePending.current &&
            docSessionRef.current === sessionAtSchedule
          );
        } catch (err) {
          if (docSessionRef.current === sessionAtSchedule) {
            const message = err instanceof Error ? err.message : String(err);
            store.setSaveStatus('error', message);
            store.setStatus(`Autosave failed — draft kept. ${message}`);
            store.setDirty(true);
          }
        } finally {
          liveSaveInFlight.current = false;
        }
      })();
    }, LIVE_DISK_SAVE_MS);

    return () => window.clearTimeout(id);
  }, [
    hasDiskPath,
    documentBytes,
    meta,
    dirty,
    overlays,
    formFields,
    saveIo,
    store,
    persistWorkingEdits,
  ]);

  useEffect(() => {
    let cancelled = false;
    async function loadThumbs(): Promise<void> {
      if (!doc || viewerPageCount === 0) {
        setThumbs([]);
        return;
      }
      // Show placeholders immediately so sidebar isn't "No pages" while rendering
      setThumbs(
        Array.from({ length: viewerPageCount }, (_, pageIndex) => ({
          pageIndex,
          dataUrl: null,
        })),
      );
      const items: ThumbnailItem[] = [];
      for (let i = 0; i < viewerPageCount; i++) {
        const dataUrl = await renderThumbnail(i);
        if (cancelled) return;
        items.push({ pageIndex: i, dataUrl });
        setThumbs([
          ...items,
          ...Array.from(
            { length: viewerPageCount - items.length },
            (_, j) => ({ pageIndex: items.length + j, dataUrl: null }),
          ),
        ]);
        // Yield so Open / mode clicks stay responsive on long docs
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      }
      if (!cancelled) setThumbs(items);
    }
    void loadThumbs();
    return () => {
      cancelled = true;
    };
  }, [doc, viewerPageCount, renderThumbnail]);

  const openBytes = useCallback(
    async (bytes: Uint8Array, path: string, name: string) => {
      // New document session — cancel in-flight autosave / Smart Fill targeting the old file
      docSessionRef.current += 1;
      const session = docSessionRef.current;
      liveSavePending.current = false;
      syncedRectsForGen.current = null;
      autoFillPathRef.current = null;

      store.setStatus(`Opening ${name}…`);
      assertSafePdfBytes(bytes, name);

      // Prefer unbaked working base so Add Text / overlays stay re-editable after reopen
      const cachedBase = await getBasePdf(path);
      if (docSessionRef.current !== session) return;
      const workingBytes = cachedBase ?? bytes;
      assertSafePdfBytes(workingBytes, name);

      const layer = loadAnnotationLayer(path);
      const acroFields = await loadAcroFormFields(workingBytes);
      if (docSessionRef.current !== session) return;

      // Sidecar form fields survive flatten; prefer them when present
      const fields =
        layer && layer.formFields.length > 0 ? layer.formFields : acroFields;

      const metaDoc: DocumentMeta = {
        path,
        fileName: name,
        pageCount: 0,
        fileSize: workingBytes.byteLength,
        lastModified: Date.now(),
      };
      const pdf = await PDFDocument.load(workingBytes, {
        ignoreEncryption: true,
        updateMetadata: false,
      });
      if (docSessionRef.current !== session) return;

      metaDoc.pageCount = pdf.getPageCount();
      store.setDocument(workingBytes, metaDoc, fields);

      if (layer && layer.overlays.length > 0) {
        useDocumentStore.setState((s) => {
          s.overlays = layer.overlays;
          s.selectedIds = [];
          s.dirty = false;
          s.mode = 'add';
        });
        setAddTool('select');
      }

      // Only remember absolute disk paths (drag/drop browser names can't reopen)
      if (path.includes('/') || path.includes('\\')) {
        const recent = addRecentFile({ path, name });
        store.setRecentFiles(recent);
      }
      setAddTool('select');
      setFocusedFieldId(null);
      setOrganizeSelected([]);
      setCompareResult(null);
      setSigOpen(false);
      setShortcutsOpen(false);
      setSettingsOpen(false);
      setOcrOpen(false);
      setPasswordDialog({ open: false, mode: 'unlock', error: null });
      // setDocument already enters fill — avoid re-forcing mode later
      const overlayN = layer?.overlays.length ?? 0;
      store.setStatus(
        overlayN > 0
          ? `Opened ${name} · ${overlayN} editable annotation(s) restored`
          : fields.length > 0
            ? `Opened ${name} · ${fields.length} form field(s)`
            : `Opened ${name}`,
      );
      await restoreUiAfterNativeDialog();
    },
    [store],
  );

  const handleOpen = useCallback(async () => {
    if (openingRef.current) return;
    const current = useDocumentStore.getState();
    if (current.dirty) {
      const ok = window.confirm(
        'Switch to another PDF?\n\nThis replaces the document on screen — it does not merge or overwrite the file you pick.\nEdits to the current file may still be autosaving.',
      );
      if (!ok) {
        await restoreUiAfterNativeDialog();
        return;
      }
    }

    openingRef.current = true;
    // Let the confirm dialog fully dismiss before the native file picker (avoids Windows freeze)
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 60);
    });

    store.setStatus('Choose a PDF to open…');
    try {
      const opened = await openPdfDialog();
      await restoreUiAfterNativeDialog();
      if (!opened) {
        store.setStatus(current.meta ? `Ready · ${current.meta.fileName}` : 'Ready');
        return;
      }
      await openBytes(opened.bytes, opened.path, opened.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      store.setStatus(`Could not open PDF: ${message}`);
      await restoreUiAfterNativeDialog();
    } finally {
      openingRef.current = false;
    }
  }, [openBytes, store]);

  const handleDropFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (openingRef.current) return;
      const current = useDocumentStore.getState();
      if (current.dirty) {
        const ok = window.confirm(
          'Switch to this PDF?\n\nThis replaces the document on screen — it does not merge files.',
        );
        if (!ok) {
          await restoreUiAfterNativeDialog();
          return;
        }
      }
      openingRef.current = true;
      try {
        store.setStatus(`Opening ${file.name}…`);
        const bytes = await fileToBytes(file);
        await openBytes(bytes, file.name, file.name);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        store.setStatus(`Could not open PDF: ${message}`);
      } finally {
        openingRef.current = false;
        await restoreUiAfterNativeDialog();
      }
    },
    [openBytes, store],
  );

  const handleOpenRecent = useCallback(
    async (path: string, name: string) => {
      if (openingRef.current) return;
      const current = useDocumentStore.getState();
      if (current.dirty) {
        const ok = window.confirm(
          'Switch to this PDF?\n\nThis replaces the document on screen — it does not merge files.',
        );
        if (!ok) {
          await restoreUiAfterNativeDialog();
          return;
        }
      }
      openingRef.current = true;
      store.setStatus(`Opening ${name}…`);
      try {
        if (!isTauri()) {
          store.setStatus('Recent files need the desktop app — use Open');
          openingRef.current = false;
          await handleOpen();
          return;
        }
        const bytes = await readPdfFromPath(path);
        if (!bytes || bytes.byteLength < 8) {
          throw new Error('File is empty or missing — remove it from Recent');
        }
        await openBytes(bytes, path, name);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to open recent file';
        const scopeHint =
          /scope|not allowed|forbidden|denied|os error|access/i.test(message)
            ? ' — file may be outside allowed folders; use Open'
            : '';
        store.setStatus(`${message}${scopeHint}`);
        // Only drop from Recent when the file is truly gone — keep entries on scope/permission errors
        if (/not found|no such file|empty|missing/i.test(message)) {
          store.setRecentFiles(removeRecentFile(path));
        }
      } finally {
        openingRef.current = false;
        await restoreUiAfterNativeDialog();
      }
    },
    [openBytes, handleOpen, store],
  );

  const handleRemoveRecent = useCallback(
    (path: string) => {
      store.setRecentFiles(removeRecentFile(path));
    },
    [store],
  );

  const handleClearRecent = useCallback(() => {
    clearRecentFiles();
    store.setRecentFiles([]);
  }, [store]);

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

  const handleSaveAsFixed = useCallback(async () => {
    if (!documentBytes || !meta) return;
    let target: string | null = null;
    try {
      target = await pickSavePath(meta.fileName);
    } finally {
      await restoreUiAfterNativeDialog();
    }
    if (!target) return;
    store.setSaveStatus('saving');
    store.setStatus('Saving As…');
    try {
      store.setSaveStatus('verifying');
      store.setStatus('Verifying…');
      const result = await withSaveLock(() =>
        saveAs({
          targetPath: target,
          originalBytes: documentBytes,
          overlays,
          formFields,
          io: saveIo,
        }),
      );
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
        void persistWorkingEdits(result.path, documentBytes);
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
    persistWorkingEdits,
  ]);

  const handleSave = useCallback(async () => {
    if (!documentBytes || !meta) return;
    // Drag/drop or browser open has no real disk path — force Save As
    if (!hasDiskPath) {
      await handleSaveAsFixed();
      return;
    }
    store.setSaveStatus('saving');
    store.setStatus('Saving…');
    try {
      store.setSaveStatus('verifying');
      store.setStatus('Verifying…');
      const result = await withSaveLock(() =>
        verifiedSave({
          originalPath: meta.path,
          originalBytes: documentBytes,
          overlays,
          formFields,
          io: saveIo,
        }),
      );
      applySaveResult(result, false);
      if (result.success) {
        addRecentFile({ path: meta.path, name: meta.fileName });
        store.setRecentFiles(listRecentFiles());
        void persistWorkingEdits(meta.path, documentBytes);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      store.setSaveStatus('error', message);
      store.setStatus(`Save failed: ${message}`);
      store.setDirty(true);
    }
  }, [
    documentBytes,
    meta,
    hasDiskPath,
    overlays,
    formFields,
    saveIo,
    store,
    applySaveResult,
    handleSaveAsFixed,
    persistWorkingEdits,
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
    const session = docSessionRef.current;
    const all = [];
    for (let i = 0; i < doc.numPages; i++) {
      if (docSessionRef.current !== session) return;
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
      // Yield so Open / UI stay responsive on multi-page PDFs
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    }
    if (docSessionRef.current !== session) return;
    const existing = useDocumentStore.getState().formFields;
    const filtered = filterSuggestionsAgainstFields(all, existing);
    store.setSmartFillSuggestions(filtered);
    return filtered;
  }, [doc, getPage, store]);

  /** On open: detect fillables in the background. Never steal mode after the user switches. */
  useEffect(() => {
    if (!doc || !meta || !smartFillOn) return;
    if (autoFillPathRef.current === meta.path) return;

    const session = docSessionRef.current;
    const path = meta.path;
    let cancelled = false;
    void (async () => {
      // Let the first paint + toolbar clicks land before scanning text
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 250);
      });
      if (cancelled || docSessionRef.current !== session) return;

      const existingCount = useDocumentStore.getState().formFields.length;
      const suggestions = await runSmartFill();
      if (cancelled || docSessionRef.current !== session) return;
      autoFillPathRef.current = path;
      if (!suggestions) return;

      // Only auto-apply while still in Fill — never yank the user out of View/Add/Sign/Organize
      if (useDocumentStore.getState().mode !== 'fill') {
        store.setSmartFillSuggestions(suggestions);
        return;
      }

      if (existingCount > 0) {
        const gaps = suggestions.filter((s) => s.kind === 'checkbox');
        store.setSmartFillSuggestions(gaps);
        const n = store.acceptAllSmartFill();
        const total = useDocumentStore.getState().formFields.length;
        if (useDocumentStore.getState().mode === 'fill') {
          store.setStatus(
            n > 0
              ? `Ready to fill · ${total} field(s) (+${n} checkbox${n === 1 ? '' : 'es'})`
              : `Ready to fill · ${total} form field(s)`,
          );
        }
        return;
      }

      // Cap auto-accept so huge scans don't freeze the toolbar
      const MAX_AUTO = 80;
      if (suggestions.length > MAX_AUTO) {
        store.setSmartFillSuggestions(suggestions.slice(0, MAX_AUTO));
        store.acceptAllSmartFill();
        store.setSmartFillSuggestions(suggestions.slice(MAX_AUTO));
        if (useDocumentStore.getState().mode === 'fill') {
          store.setStatus(
            `Ready to fill · ${MAX_AUTO}+ fields detected — confirm more with Smart Fill`,
          );
        }
        return;
      }

      const n = store.acceptAllSmartFill();
      const total = useDocumentStore.getState().formFields.length;
      if (useDocumentStore.getState().mode === 'fill') {
        store.setStatus(
          total > 0
            ? `Ready to fill · ${total} field(s)${n > 0 ? ` (+${n} detected)` : ''} — type away`
            : 'No fillable fields detected — try Add tools',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, meta, smartFillOn, runSmartFill, store]);

  const onSmartFillChange = useCallback(
    (enabled: boolean) => {
      setSmartFillOn(enabled);
      if (enabled) {
        autoFillPathRef.current = null;
        const session = docSessionRef.current;
        void (async () => {
          const suggestions = await runSmartFill();
          if (docSessionRef.current !== session) return;
          if (suggestions) store.acceptAllSmartFill();
        })();
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
      void (async () => {
        try {
          const pdf = await PDFDocument.load(newBytes, {
            ignoreEncryption: true,
            updateMetadata: false,
          });
          const nextPageCount = pdf.getPageCount();
          store.replaceDocumentBytes(newBytes, nextPageCount);
          useDocumentStore.setState((s) => {
            if (!s.meta) return;
            s.overlays = nextOverlays;
            s.formFields = nextFields;
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
        } catch (err) {
          store.setStatus(
            err instanceof Error ? err.message : 'Organize failed',
          );
        }
      })();
    },
    [store],
  );

  const onModeChange = useCallback(
    (next: AppMode) => {
      if (next === 'open') {
        void handleOpen();
        return;
      }
      // Mode switch must stay instant — never block on Smart Fill / scans
      store.setMode(next);
      if (next === 'add') setAddTool('text');
      if (next === 'sign') {
        // Enter Sign mode with select so existing signatures stay draggable.
        // Opening the pad is explicit via the Sign tool button.
        setAddTool('select');
      }
      if (next === 'view' || next === 'organize' || next === 'fill') {
        setAddTool('select');
      }
      if (next === 'organize') setOrganizeSelected([]);
      void restoreUiAfterNativeDialog();
    },
    [handleOpen, store],
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
        let target: string | null = null;
        try {
          target = await pickSavePath(
            meta.fileName.replace(/\.pdf$/i, '') + '-extract.pdf',
          );
        } finally {
          await restoreUiAfterNativeDialog();
        }
        if (!target) return;
        await withSaveLock(() => saveBytes(target, extracted));
        store.setStatus(`Extracted ${indexes.length} page(s) → ${target}`);
      } catch (err) {
        store.setStatus(err instanceof Error ? err.message : String(err));
      }
    },
    [documentBytes, meta, store],
  );

  const handleOrganizeMerge = useCallback(async () => {
    if (!documentBytes) return;
    let opened: Awaited<ReturnType<typeof openPdfDialog>> = null;
    try {
      opened = await openPdfDialog();
    } finally {
      await restoreUiAfterNativeDialog();
    }
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
      store.replaceDocumentBytes(result.bytes);
      store.setStatus(
        `Compressed ${formatBytes(result.before)} → ${formatBytes(result.after)}`,
      );
    } catch (err) {
      store.setStatus(err instanceof Error ? err.message : String(err));
    }
  }, [documentBytes, store]);

  const handleCompare = useCallback(async () => {
    if (!documentBytes) return;
    let opened: Awaited<ReturnType<typeof openPdfDialog>> = null;
    try {
      opened = await openPdfDialog();
    } finally {
      await restoreUiAfterNativeDialog();
    }
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
          const ok = window.confirm(
            'Remove encryption from this PDF?\n\nThis creates an unprotected working copy. The password is not verified by this app.',
          );
          if (!ok) {
            await restoreUiAfterNativeDialog();
            return;
          }
          await restoreUiAfterNativeDialog();
          const next = await unlockPdf(documentBytes, password);
          store.replaceDocumentBytes(next);
          store.setStatus('Encryption stripped (unprotected copy — Save to keep)');
        } else {
          const next = await protectPdf(
            documentBytes,
            password,
            ownerPassword,
          );
          store.replaceDocumentBytes(next);
          store.setStatus('PDF protected');
        }
        setPasswordDialog({ open: false, mode: 'unlock', error: null });
      } catch (err) {
        setPasswordDialog((d) => ({
          ...d,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [documentBytes, passwordDialog.mode, store],
  );

  const handleOcrSuggestions = useCallback(
    (items: OcrTextItem[], pageWidth: number, pageHeight: number) => {
      const hints: TextItemHint[] = items.map((item) => ({
        str: item.str,
        transform: item.transform,
        width: item.width,
        height: item.height,
      }));
      const suggestions = filterSuggestionsAgainstFields(
        detectSmartFillSuggestions(pageWidth, pageHeight, currentPage, hints),
        useDocumentStore.getState().formFields,
      );
      store.setSmartFillSuggestions(suggestions);
      store.setMode('fill');
      const n = store.acceptAllSmartFill();
      store.setStatus(
        `OCR → Fill: ${n} field(s) ready (PDF unchanged until you type/save)`,
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

  const pickOverlayImageFile = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/jpg,image/webp,image/gif';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        if (file.size > 8 * 1024 * 1024) {
          store.setStatus('Image too large (max 8 MB)');
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const url = typeof reader.result === 'string' ? reader.result : null;
          if (!url || !/^data:image\//i.test(url)) {
            store.setStatus('Could not read that image');
            resolve(null);
            return;
          }
          resolve(url);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }, [store]);

  const placeImageAt = useCallback(
    async (at: { pageIndex: number; x: number; y: number }) => {
      const dataUrl = await pickOverlayImageFile();
      await restoreUiAfterNativeDialog();
      if (!dataUrl) return;
      const zIndex = useDocumentStore.getState().overlays.length + 1;
      store.addOverlay({
        pageIndex: at.pageIndex,
        kind: 'image',
        x: at.x,
        y: at.y,
        width: 160,
        height: 120,
        rotation: 0,
        zIndex,
        imageDataUrl: dataUrl,
        opacity: 1,
      });
      setAddTool('select');
      store.setStatus('Image placed — drag to move, corners to resize');
    },
    [pickOverlayImageFile, store],
  );

  const replaceOverlayImage = useCallback(
    async (overlayId: string) => {
      const dataUrl = await pickOverlayImageFile();
      await restoreUiAfterNativeDialog();
      if (!dataUrl) return;
      store.updateOverlay(overlayId, { imageDataUrl: dataUrl });
      store.setStatus('Image updated');
    },
    [pickOverlayImageFile, store],
  );

  const onSignatureSaved = useCallback(
    async (result: SignaturePadResult) => {
      const place = pendingSig;
      let dataUrl = result.dataUrl;
      // Always strip white so ink doesn't cover text behind the signature
      if (result.cleanup !== false) {
        dataUrl = await toTransparentSignatureInk(dataUrl);
      } else {
        try {
          dataUrl = await cleanupSignaturePng(dataUrl);
        } catch {
          // keep original
        }
      }
      let signatureId: string | undefined;
      if (result.saveToLibrary) {
        const saved = saveSignature({
          name: result.name?.trim() || 'My signature',
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
      setSigOpen(false);
      setPendingSig(null);
      if (!place) return;

      const field = place.fieldId
        ? useDocumentStore.getState().formFields.find((f) => f.id === place.fieldId)
        : undefined;

      if (place.fieldId) {
        store.setFormValue(place.fieldId, dataUrl);
      }

      const width = Math.max(80, field?.rect.width ?? 200);
      const height = Math.max(28, field?.rect.height ?? 60);
      const x = field?.rect.x ?? place.x;
      const y = field?.rect.y ?? place.y;

      store.addOverlay({
        pageIndex: place.pageIndex,
        kind: 'signature',
        x,
        y,
        width,
        height,
        rotation: 0,
        zIndex: useDocumentStore.getState().overlays.length + 1,
        imageDataUrl: dataUrl,
        signatureId,
        color: '#000000',
      });
      // Select tool so the signature can be dragged immediately
      setAddTool('select');
      store.setMode('sign');
      store.setStatus('Signature applied — drag to move, corners to resize');
    },
    [pendingSig, store],
  );

  const openSignFromToolbar = useCallback(() => {
    store.setMode('sign');
    setAddTool('signature');
    openSignatureAt({
      pageIndex: currentPage,
      x: 72,
      y: 520,
    });
  }, [store, openSignatureAt, currentPage]);

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
          '.toolbar__search, input[aria-label="Search"]',
        );
        input?.focus();
        input?.select();
      },
      undo: () => store.undo(),
      redo: () => store.redo(),
      delete: () => store.deleteOverlays(selectedIds),
      duplicate: () => store.duplicateOverlays(selectedIds),
      selectAll: () => {
        const ids = useDocumentStore.getState().overlays.map((o) => o.id);
        store.select(ids);
      },
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
      zoomIn: () => store.setZoom(zoom * 1.15),
      zoomOut: () => store.setZoom(zoom / 1.15),
      zoomReset: () => store.setZoom(1),
      zoom100: () => store.setZoom(1),
      zoom200: () => store.setZoom(2),
      zoom50: () => store.setZoom(0.5),
      zoomFitPage: () => store.setZoomMode('fit-page'),
      zoomFitWidth: () => store.setZoomMode('fit-width'),
      pagePrev: () => {
        const next = Math.max(0, currentPage - 1);
        store.setPage(next);
        jumpViewerToPage(next);
      },
      pageNext: () => {
        const last = Math.max(0, viewerPageCount - 1);
        const next = Math.min(last, currentPage + 1);
        store.setPage(next);
        jumpViewerToPage(next);
      },
      pageFirst: () => {
        store.setPage(0);
        jumpViewerToPage(0);
      },
      pageLast: () => {
        const last = Math.max(0, viewerPageCount - 1);
        store.setPage(last);
        jumpViewerToPage(last);
      },
      modeView: () => onModeChange('view'),
      modeFill: () => onModeChange('fill'),
      modeAdd: () => onModeChange('add'),
      modeSign: () => onModeChange('sign'),
      modeOrganize: () => onModeChange('organize'),
      toggleSidebar: () => store.toggleSidebar(),
      showShortcuts: () => setShortcutsOpen(true),
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
        ? `PDF view failed: ${pdfError}`
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
      onRequestSignature={openSignFromToolbar}
      onCompress={() => void handleCompress()}
      onProtect={() =>
        setPasswordDialog({ open: true, mode: 'protect', error: null })
      }
      onUnlock={() =>
        setPasswordDialog({ open: true, mode: 'unlock', error: null })
      }
      onCompare={() => void handleCompare()}
      onOcr={() => setOcrOpen(true)}
      onShowShortcuts={() => setShortcutsOpen(true)}
      onOpenSettings={() => setSettingsOpen(true)}
      theme={theme}
      onToggleTheme={() => setThemeState(setTheme(theme === 'dark' ? 'light' : 'dark'))}
      updateAvailable={Boolean(updateInfo)}
      recentFiles={recentFiles}
      onOpenRecent={(path, name) => void handleOpenRecent(path, name)}
      onRemoveRecent={handleRemoveRecent}
      onClearRecent={handleClearRecent}
    />
  );

  return (
    <>
      <AppShell
        toolbar={emptyState ? null : toolbar}
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
          emptyState
            ? undefined
            : `Page ${currentPage + 1} / ${viewerPageCount || pageCount}`
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
            onRemoveRecent={handleRemoveRecent}
            onClearRecent={handleClearRecent}
            onFileInput={(file) => void handleDropFiles([file])}
            theme={theme}
            onToggleTheme={() =>
              setThemeState(setTheme(theme === 'dark' ? 'light' : 'dark'))
            }
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : mode === 'organize' ? (
          <OrganizePanel
            pageCount={viewerPageCount}
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
            pageCount={viewerPageCount}
            currentPage={currentPage}
            onPageChange={(p) => store.setPage(p)}
            zoom={zoom}
            zoomMode={zoomMode}
            onZoomChange={(z, source) => {
              if (source === 'fit') {
                useDocumentStore.setState((s) => {
                  s.zoom = Math.min(5, Math.max(0.1, z));
                });
              } else {
                store.setZoom(z);
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
                  onRequestImage={(at) =>
                    void placeImageAt({
                      pageIndex,
                      x: at.x,
                      y: at.y,
                    })
                  }
                  onReplaceImage={(id) => void replaceOverlayImage(id)}
                  onToolConsumed={() => setAddTool('select')}
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
                  onAcceptAllSuggestions={() => {
                    const n = store.acceptAllSmartFill();
                    if (n > 0 && !hasDiskPath) {
                      store.setStatus(
                        'Fields ready — use Save / Save As so typing writes to a real file',
                      );
                    }
                  }}
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

      <ShortcutsHelpDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        theme={theme}
        onThemeChange={(next) => setThemeState(setTheme(next))}
        updateAvailable={updateInfo}
        onUpdateAvailable={(info) => {
          setUpdateInfo(info);
          if (info) setShowUpdateToast(true);
        }}
        onShowWhatsNew={(version) => {
          setSettingsOpen(false);
          setWhatsNewVersion(version);
        }}
      />

      <WhatsNewDialog
        open={Boolean(whatsNewVersion)}
        version={whatsNewVersion ?? APP_VERSION}
        onContinue={dismissWhatsNew}
      />

      {showUpdateToast && updateInfo ? (
        <UpdateToast
          update={updateInfo}
          installing={updateInstalling}
          progress={updateProgress}
          onUpdate={onUpdateToastConfirm}
          onCancel={onUpdateToastCancel}
        />
      ) : null}

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
