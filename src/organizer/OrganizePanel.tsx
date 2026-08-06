import type { ThumbnailItem } from '../viewer/ThumbnailSidebar.tsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Frame, FrameHeader, FramePanel } from '@/components/frame';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  FilePlus2,
  RotateCw,
  Scissors,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type OrganizePanelProps = {
  pageCount: number;
  currentPage: number;
  thumbnails?: ThumbnailItem[];
  selectedPages: number[];
  onSelectPages: (pages: number[]) => void;
  onApplyReorder: (newOrder: number[]) => void;
  onRotate: (pageIndexes: number[], degrees: 90 | 180 | 270) => void;
  onDelete: (pageIndexes: number[]) => void;
  onDuplicate: (pageIndex: number) => void;
  onExtract: (pageIndexes: number[]) => void;
  onMergeRequest: () => void;
  onJump: (pageIndex: number) => void;
};

function togglePage(selected: number[], page: number): number[] {
  return selected.includes(page)
    ? selected.filter((p) => p !== page)
    : [...selected, page].sort((a, b) => a - b);
}

function moveUp(pageCount: number, selected: number[]): number[] | null {
  const order = Array.from({ length: pageCount }, (_, i) => i);
  const sel = [...new Set(selected)].sort((a, b) => a - b);
  if (sel.length === 0 || sel[0] === 0) return null;
  for (const i of sel) {
    const pos = order.indexOf(i);
    if (pos <= 0) continue;
    const prev = order[pos - 1]!;
    if (sel.includes(prev)) continue;
    order[pos - 1] = i;
    order[pos] = prev;
  }
  return order;
}

function moveDown(pageCount: number, selected: number[]): number[] | null {
  const order = Array.from({ length: pageCount }, (_, i) => i);
  const sel = [...new Set(selected)].sort((a, b) => b - a);
  if (sel.length === 0 || sel[0] === pageCount - 1) return null;
  for (const i of sel) {
    const pos = order.indexOf(i);
    if (pos < 0 || pos >= order.length - 1) continue;
    const next = order[pos + 1]!;
    if (sel.includes(next)) continue;
    order[pos + 1] = i;
    order[pos] = next;
  }
  return order;
}

export function OrganizePanel({
  pageCount,
  currentPage,
  thumbnails = [],
  selectedPages,
  onSelectPages,
  onApplyReorder,
  onRotate,
  onDelete,
  onDuplicate,
  onExtract,
  onMergeRequest,
  onJump,
}: OrganizePanelProps) {
  const thumbMap = new Map(thumbnails.map((t) => [t.pageIndex, t.dataUrl]));
  const hasSelection = selectedPages.length > 0;
  const primary = selectedPages[0] ?? currentPage;

  return (
    <Frame className="flex h-full min-h-0 flex-col">
      <FramePanel className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FrameHeader
          title="Organize pages"
          description={`${pageCount} page${pageCount === 1 ? '' : 's'}`}
          action={
            selectedPages.length > 0 ? (
              <Badge variant="secondary" className="text-[10px]">
                {selectedPages.length} selected
              </Badge>
            ) : null
          }
        />

        <div className="flex flex-wrap gap-1 border-b border-border/70 px-3 py-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={!hasSelection}
            onClick={() => {
              const next = moveUp(pageCount, selectedPages);
              if (next) onApplyReorder(next);
            }}
          >
            <ArrowUp className="size-3.5" />
            Up
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={!hasSelection}
            onClick={() => {
              const next = moveDown(pageCount, selectedPages);
              if (next) onApplyReorder(next);
            }}
          >
            <ArrowDown className="size-3.5" />
            Down
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={!hasSelection}
            onClick={() => onRotate(selectedPages, 90)}
          >
            <RotateCw className="size-3.5" />
            Rotate 90°
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={!hasSelection}
            onClick={() => onDuplicate(primary)}
          >
            <Copy className="size-3.5" />
            Duplicate
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={!hasSelection}
            onClick={() => onDelete(selectedPages)}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={!hasSelection}
            onClick={() => onExtract(selectedPages)}
          >
            <Scissors className="size-3.5" />
            Extract
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-[11px]"
            onClick={onMergeRequest}
          >
            <FilePlus2 className="size-3.5" />
            Merge PDF…
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <ul className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: pageCount }, (_, i) => {
              const selected = selectedPages.includes(i);
              const dataUrl = thumbMap.get(i);
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={cn(
                      'group flex w-full flex-col gap-1 rounded-md border p-1.5 text-left transition-colors',
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border/80 hover:border-border hover:bg-muted/40',
                      currentPage === i && 'ring-1 ring-primary/40',
                    )}
                    onClick={(e) => {
                      if (e.shiftKey || e.metaKey || e.ctrlKey) {
                        onSelectPages(togglePage(selectedPages, i));
                      } else {
                        onSelectPages([i]);
                        onJump(i);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1.5 px-0.5">
                      <input
                        type="checkbox"
                        checked={selected}
                        aria-label={`Select page ${i + 1}`}
                        className="size-3.5 accent-primary"
                        onClick={(e) => e.stopPropagation()}
                        onChange={() =>
                          onSelectPages(togglePage(selectedPages, i))
                        }
                      />
                      <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                    </div>
                    <div className="aspect-[3/4] w-full overflow-hidden rounded bg-muted/50">
                      {dataUrl ? (
                        <img
                          src={dataUrl}
                          alt={`Page ${i + 1}`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                          Page {i + 1}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </FramePanel>
    </Frame>
  );
}
