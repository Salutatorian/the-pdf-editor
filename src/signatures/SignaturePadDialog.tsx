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

export type SignaturePadTab = 'draw' | 'type' | 'import';

export type SignaturePadResult = {
  dataUrl: string;
  source: SignaturePadTab;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas || !pad) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    ctx?.scale(ratio, ratio);
    pad.clear();
    setDrawEmpty(true);
  }, []);

  useEffect(() => {
    if (!open || tab !== 'draw') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(20, 24, 28)',
    });
    padRef.current = pad;
    setDrawEmpty(true);
    resizeCanvas();

    const syncEmpty = () => setDrawEmpty(pad.isEmpty());
    pad.addEventListener('endStroke', syncEmpty);
    pad.addEventListener('beginStroke', syncEmpty);

    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      pad.removeEventListener('endStroke', syncEmpty);
      pad.removeEventListener('beginStroke', syncEmpty);
      pad.off();
      padRef.current = null;
    };
  }, [open, tab, resizeCanvas]);

  useEffect(() => {
    if (!open) {
      setTab('draw');
      setTyped(defaultName);
      setImportUrl(null);
      setCleanup(true);
      setSaveToLibrary(true);
      setDrawEmpty(true);
    }
  }, [open, defaultName]);

  const onImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'image/png') {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImportUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const clearDraw = () => {
    padRef.current?.clear();
    setDrawEmpty(true);
  };

  const buildTypedDataUrl = (): string | null => {
    const text = typed.trim();
    if (!text) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#14181c';
    ctx.font = 'italic 64px "IBM Plex Serif", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL('image/png');
  };

  const handleSave = () => {
    let dataUrl: string | null = null;

    switch (tab) {
      case 'draw': {
        const pad = padRef.current;
        if (!pad || pad.isEmpty()) return;
        dataUrl = pad.toDataURL('image/png');
        break;
      }
      case 'type': {
        dataUrl = buildTypedDataUrl();
        break;
      }
      case 'import': {
        dataUrl = importUrl;
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
      source: tab,
      name: typed.trim() || undefined,
      cleanup,
      saveToLibrary,
    });
  };

  const saveEnabled =
    (tab === 'draw' && !drawEmpty) ||
    (tab === 'type' && typed.trim().length > 0) ||
    (tab === 'import' && Boolean(importUrl));

  const onTabChange = (value: string) => {
    if (value === 'draw' || value === 'type' || value === 'import') {
      setTab(value);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create signature</DialogTitle>
          <DialogDescription>
            Draw, type, or import a PNG. This places a visual signature image — not
            a certificate-based digital signature.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={onTabChange} className="gap-3">
          <TabsList className="w-full" aria-label="Signature method">
            <TabsTrigger value="draw" className="flex-1">
              Draw
            </TabsTrigger>
            <TabsTrigger value="type" className="flex-1">
              Type
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1">
              Import PNG
            </TabsTrigger>
          </TabsList>

          <TabsContent value="draw">
            <canvas
              ref={canvasRef}
              className="h-[180px] w-full cursor-crosshair touch-none rounded-md border border-border bg-white"
            />
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
            <div
              className="flex min-h-[100px] items-center justify-center rounded-md border border-border bg-white px-5 py-4 text-center text-4xl italic break-words text-[#111]"
              aria-label="Signature preview"
              style={{ fontFamily: 'var(--font-brand)' }}
            >
              {typed.trim() || 'Preview'}
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">PNG file</span>
              <Input
                type="file"
                accept="image/png"
                onChange={onImportFile}
              />
            </label>
            {importUrl ? (
              <img
                src={importUrl}
                alt="Imported signature preview"
                className="max-h-40 max-w-full rounded-md border border-border bg-white object-contain p-2"
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Choose a transparent PNG for best results.
              </p>
            )}
          </TabsContent>
        </Tabs>

        <label className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="accent-primary"
            checked={cleanup}
            onChange={(e) => setCleanup(e.target.checked)}
          />
          Clean up white background
        </label>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="accent-primary"
            checked={saveToLibrary}
            onChange={(e) => setSaveToLibrary(e.target.checked)}
          />
          Save to signature library
        </label>

        <p className="text-xs leading-normal text-muted-foreground">
          This places a visual signature image. It is not a certificate-based digital
          signature.
        </p>

        <DialogFooter className="sm:justify-between">
          {tab === 'draw' ? (
            <Button variant="ghost" onClick={clearDraw}>
              Clear
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!saveEnabled}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
