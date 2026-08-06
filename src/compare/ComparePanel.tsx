import { Frame, FrameHeader, FramePanel } from '@/components/frame';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type CompareResultView = {
  pageCounts: { a: number; b: number; equal: boolean };
  hashes: { equal: boolean; aHash: string; bHash: string };
  otherName: string;
};

export type ComparePanelProps = {
  result: CompareResultView;
  onClose: () => void;
};

export function ComparePanel({ result, onClose }: ComparePanelProps) {
  return (
    <div className="absolute bottom-4 left-4 z-40 w-96 max-w-[calc(100%-2rem)]">
      <Frame>
        <FramePanel>
          <FrameHeader
            title="Compare"
            description={`vs ${result.otherName}`}
            action={
              <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onClose}>
                Close
              </Button>
            }
          />
          <div className="space-y-3 p-4 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Page counts</span>
              <span className="tabular-nums">
                {result.pageCounts.a} vs {result.pageCounts.b}{' '}
                <Badge
                  variant={result.pageCounts.equal ? 'secondary' : 'outline'}
                  className="ml-1 text-[10px]"
                >
                  {result.pageCounts.equal ? 'equal' : 'differ'}
                </Badge>
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Byte hash (SHA-256)</span>
                <Badge
                  variant={result.hashes.equal ? 'secondary' : 'outline'}
                  className="text-[10px]"
                >
                  {result.hashes.equal ? 'identical' : 'different'}
                </Badge>
              </div>
              <p className="break-all font-mono text-[10px] text-muted-foreground">
                A: {result.hashes.aHash.slice(0, 16)}…
              </p>
              <p className="break-all font-mono text-[10px] text-muted-foreground">
                B: {result.hashes.bHash.slice(0, 16)}…
              </p>
            </div>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}
