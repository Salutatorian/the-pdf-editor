import { useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Frame, FrameHeader, FramePanel } from '@/components/frame';
import {
  isOcrAvailable,
  renderPageToImageData,
  runOcr,
  type OcrTextItem,
} from './OcrService.ts';

export type OcrPanelProps = {
  open: boolean;
  pageIndex: number;
  getPage: (pageIndex: number) => Promise<PDFPageProxy | null>;
  onSuggestions: (items: OcrTextItem[], pageWidth: number, pageHeight: number) => void;
  onClose: () => void;
};

export function OcrPanel({
  open,
  pageIndex,
  getPage,
  onSuggestions,
  onClose,
}: OcrPanelProps) {
  const [status, setStatus] = useState<string>('Idle');
  const [busy, setBusy] = useState(false);
  const available = isOcrAvailable();

  if (!open) return null;

  const run = async () => {
    if (!available) {
      setStatus('OCR pack unavailable');
      return;
    }
    setBusy(true);
    setStatus('Rendering page…');
    try {
      const page = await getPage(pageIndex);
      if (!page) throw new Error('Page not loaded');
      const { imageData, width, height } = await renderPageToImageData(page, 2);
      setStatus('Running OCR…');
      const result = await runOcr(imageData, { deskew: true });
      onSuggestions(result.textItems, width, height);
      const deskewNote =
        result.deskewAngle !== undefined
          ? ` (skew ~${result.deskewAngle}° noted, not applied)`
          : '';
      setStatus(
        `Found ${result.textItems.length} word(s)${deskewNote}. Suggestions only — PDF unchanged.`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute bottom-4 right-4 z-40 w-80 max-w-[calc(100%-2rem)]">
      <Frame>
        <FramePanel>
          <FrameHeader
            title="OCR page"
            description={`Page ${pageIndex + 1} — suggestions only`}
            action={
              <Badge variant={available ? 'secondary' : 'outline'} className="text-[10px]">
                {available ? 'ready' : 'unavailable'}
              </Badge>
            }
          />
          <div className="space-y-3 p-4">
            <p className="text-xs text-muted-foreground" role="status">
              {status}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 text-[11px]"
                disabled={busy || !available}
                onClick={() => void run()}
              >
                {busy ? 'Working…' : 'OCR page'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}
