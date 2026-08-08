import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import SignaturePad from 'signature_pad';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  deleteSignature,
  listSignatures,
  type SavedSignature,
} from './SignatureEngine.ts';

export type SignaturePadTab = 'draw' | 'type' | 'import' | 'saved';

export type SignaturePadResult = {
  dataUrl: string;
  source: Exclude<SignaturePadTab, 'saved'> | 'draw';
  name?: string;
  cleanup: boolean;
  saveToLibrary: boolean;
};

export type SignaturePadDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (result: SignaturePadResult) => void;
  defaultName?: string;
};

const BLACK = '#000000';
const PAD_W = 520;
const PAD_H = 200;

/**
 * Transparent pad — only black ink is exported (no white rectangle on the PDF).
 */
function bindSignaturePad(canvas: HTMLCanvasElement): SignaturePad {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  canvas.width = Math.floor(PAD_W * ratio);
  canvas.height = Math.floor(PAD_H * ratio);
  canvas.style.width = `${PAD_W}px`;
  canvas.style.height = `${PAD_H}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const pad = new SignaturePad(canvas, {
    penColor: BLACK,
    backgroundColor: 'rgba(0,0,0,0)',
    minWidth: 0.55,
    maxWidth: 3.4,
    velocityFilterWeight: 0.7,
    throttle: 8,
    minDistance: 2.5,
  });
  pad.clear();
  return pad;
}

export function SignaturePadDialog({
  open,
  onClose,
  onSave,
  defaultName = '',
}: SignaturePadDialogProps) {
  const [tab, setTab] = useState<SignaturePadTab>('draw');
  const [typed, setTyped] = useState(defaultName);
  const [importUrl, setImportUrl] = useState<string | null>(null);
  const [cleanup, setCleanup] = useState(true);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [drawEmpty, setDrawEmpty] = useState(true);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [library, setLibrary] = useState<SavedSignature[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  const refreshLibrary = useCallback(() => {
    setLibrary(listSignatures());
  }, []);

  useEffect(() => {
    if (!open || tab !== 'draw' || !canvasEl) return;

    const pad = bindSignaturePad(canvasEl);
    padRef.current = pad;
    // Always start blank — never reuse ink from a previous open/file.
    pad.clear();
    setDrawEmpty(true);

    const onBegin = () => setDrawEmpty(false);
    const onEnd = () => setDrawEmpty(pad.isEmpty());
    pad.addEventListener('beginStroke', onBegin);
    pad.addEventListener('endStroke', onEnd);

    return () => {
      pad.removeEventListener('beginStroke', onBegin);
      pad.removeEventListener('endStroke', onEnd);
      pad.off();
      if (padRef.current === pad) padRef.current = null;
    };
  }, [open, tab, canvasEl]);

  useEffect(() => {
    if (!open) {
      setTab('draw');
      setTyped(defaultName);
      setImportUrl(null);
      setCleanup(true);
      setSaveToLibrary(true);
      setDrawEmpty(true);
      setCanvasEl(null);
      setPickedId(null);
      return;
    }
    refreshLibrary();
    const saved = listSignatures();
    setTab(saved.length > 0 ? 'saved' : 'draw');
  }, [open, defaultName, refreshLibrary]);

  useEffect(() => {
    if (tab === 'import') setCleanup(true);
    if (tab === 'saved') refreshLibrary();
  }, [tab, refreshLibrary]);

  const clearDraw = () => {
    padRef.current?.clear();
    setDrawEmpty(true);
  };

  const onImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'image/png') return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setImportUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const buildTypedDataUrl = (): string | null => {
    const text = typed.trim();
    if (!text) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 200;
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = BLACK;
    c.font = 'italic 64px "IBM Plex Serif", Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL('image/png');
  };

  const handleSave = () => {
    let dataUrl: string | null = null;
    let source: SignaturePadResult['source'] = 'draw';
    let name = typed.trim() || undefined;
    let shouldSaveLibrary = saveToLibrary;

    switch (tab) {
      case 'draw': {
        const pad = padRef.current;
        if (!pad || pad.isEmpty()) return;
        dataUrl = pad.toDataURL('image/png');
        source = 'draw';
        break;
      }
      case 'type':
        dataUrl = buildTypedDataUrl();
        source = 'type';
        break;
      case 'import':
        dataUrl = importUrl;
        source = 'import';
        break;
      case 'saved': {
        const picked = library.find((s) => s.id === pickedId);
        if (!picked) return;
        dataUrl = picked.dataUrl;
        source = 'draw';
        name = picked.name;
        shouldSaveLibrary = false;
        break;
      }
      default: {
        const _exhaustive: never = tab;
        return _exhaustive;
      }
    }
    if (!dataUrl) return;
    onSave({
      dataUrl,
      source,
      name,
      cleanup: true,
      saveToLibrary: shouldSaveLibrary,
    });
  };

  const saveEnabled =
    (tab === 'draw' && !drawEmpty) ||
    (tab === 'type' && typed.trim().length > 0) ||
    (tab === 'import' && Boolean(importUrl)) ||
    (tab === 'saved' && Boolean(pickedId));

  const canvasRefCb = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasEl(node);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Create signature</DialogTitle>
          <DialogDescription>
            Ink only — no white box. Reuse a saved signature or draw a new one.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            if (
              v === 'draw' ||
              v === 'type' ||
              v === 'import' ||
              v === 'saved'
            ) {
              setTab(v);
            }
          }}
          className="gap-3"
        >
          <TabsList className="w-full" aria-label="Signature method">
            <TabsTrigger value="saved" className="flex-1">
              Saved
            </TabsTrigger>
            <TabsTrigger value="draw" className="flex-1">
              Draw
            </TabsTrigger>
            <TabsTrigger value="type" className="flex-1">
              Type
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1">
              Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="saved" className="mt-0 space-y-2 outline-none">
            {library.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                No saved signatures yet. Draw one and leave &quot;Save to
                signature library&quot; on.
              </p>
            ) : (
              <ul className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto">
                {library.map((sig) => (
                  <li key={sig.id} className="relative">
                    <button
                      type="button"
                      className={
                        pickedId === sig.id
                          ? 'w-full rounded-md border-2 border-primary p-2'
                          : 'w-full rounded-md border border-border p-2 hover:border-foreground/40'
                      }
                      style={{
                        backgroundImage:
                          'repeating-conic-gradient(#e8e8e8 0% 25%, #fff 0% 50%)',
                        backgroundSize: '12px 12px',
                      }}
                      onClick={() => setPickedId(sig.id)}
                    >
                      <img
                        src={sig.dataUrl}
                        alt={sig.name}
                        className="mx-auto h-14 max-w-full object-contain"
                      />
                      <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                        {sig.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${sig.name}`}
                      title="Remove"
                      className="absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded bg-[#dc2626] p-0 text-[12px] font-bold leading-none text-white shadow-sm hover:bg-[#b91c1c]"
                      onClick={() => {
                        deleteSignature(sig.id);
                        if (pickedId === sig.id) setPickedId(null);
                        refreshLibrary();
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent
            value="draw"
            forceMount
            className="mt-0 outline-none data-[state=inactive]:hidden"
          >
            <div
              className="flex justify-center overflow-hidden rounded-md border border-border"
              style={{
                touchAction: 'none',
                backgroundImage:
                  'repeating-conic-gradient(#e8e8e8 0% 25%, #fff 0% 50%)',
                backgroundSize: '16px 16px',
              }}
            >
              <canvas
                ref={canvasRefCb}
                width={PAD_W}
                height={PAD_H}
                className="sig-pad-canvas block cursor-crosshair"
                style={{
                  width: PAD_W,
                  height: PAD_H,
                  maxWidth: '100%',
                  touchAction: 'none',
                  userSelect: 'none',
                }}
                aria-label="Draw signature with mouse"
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Transparent pad — only your ink is placed on the PDF.
            </p>
          </TabsContent>

          <TabsContent value="type" className="space-y-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Name</span>
              <Input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type your name"
                autoFocus
              />
            </label>
            <div className="sig-type-preview" aria-label="Signature preview">
              {typed.trim() || 'Preview'}
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">PNG file</span>
              <Input type="file" accept="image/png" onChange={onImportFile} />
            </label>
            {importUrl ? (
              <img
                src={importUrl}
                alt="Imported signature preview"
                className="max-h-40 max-w-full rounded-md border border-border bg-[repeating-conic-gradient(#e8e8e8_0%_25%,#fff_0%_50%)] bg-size-[12px_12px] object-contain p-2"
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Prefer a transparent PNG. White backgrounds are removed on
                apply.
              </p>
            )}
          </TabsContent>
        </Tabs>

        {tab !== 'saved' ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="accent-primary"
              checked={saveToLibrary}
              onChange={(e) => setSaveToLibrary(e.target.checked)}
            />
            Save to signature library
          </label>
        ) : null}

        {tab === 'import' ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="accent-primary"
              checked={cleanup}
              onChange={(e) => setCleanup(e.target.checked)}
            />
            Remove white background
          </label>
        ) : null}

        <DialogFooter className="sm:justify-between">
          {tab === 'draw' ? (
            <Button variant="ghost" type="button" onClick={clearDraw}>
              Clear
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={!saveEnabled}>
              {tab === 'saved' ? 'Use signature' : 'Apply signature'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
