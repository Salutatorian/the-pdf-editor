import { useState } from 'react';
import type { ThumbnailItem } from '../viewer/ThumbnailSidebar.tsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Frame, FrameHeader, FramePanel } from '@/components/frame';
import {
  Copy,
  FilePlus2,
  GripVertical,
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

/** Move one page (or the selected block containing it) before `toIndex`. */
export function orderAfterDrag(
  pageCount: number,
  fromIndex: number,
  toIndex: number,
  selectedPages: number[] = [],
): number[] | null {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= pageCount ||
    toIndex >= pageCount ||
    fromIndex === toIndex
  ) {
    return null;
  }

  const order = Array.from({ length: pageCount }, (_, i) => i);
  const moving =
    selectedPages.includes(fromIndex) && selectedPages.length > 1
      ? [...new Set(selectedPages)].sort((a, b) => a - b)
      : [fromIndex];

  if (moving.includes(toIndex)) return null;

  // Drop on a page → insert before that page (take its place).
  const before = order.filter((i) => !moving.includes(i) && i < toIndex);
  const after = order.filter((i) => !moving.includes(i) && i >= toIndex);
  const next = [...before, ...moving, ...after];
  if (next.length !== pageCount) return null;
  if (next.every((v, i) => v === i)) return null;
  return next;
}

function OrganizeActions({
  hasSelection,
  selectedPages,
  onRotate,
  onDuplicate,
  onDelete,
  onExtract,
  onMergeRequest,
  primary,
}: {
  hasSelection: boolean;
  selectedPages: number[];
  primary: number;
  onRotate: OrganizePanelProps['onRotate'];
  onDuplicate: OrganizePanelProps['onDuplicate'];
  onDelete: OrganizePanelProps['onDelete'];
  onExtract: OrganizePanelProps['onExtract'];
  onMergeRequest: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border/70 px-3 py-2">
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[11px]"
        disabled={!hasSelection}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          onRotate(selectedPages, 90);
          // Keep the button focused so clicking/Enter can spam-rotate.
          e.currentTarget.blur();
          e.currentTarget.focus();
        }}
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
  );
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
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const applyDrop = (toIndex: number) => {
    if (dragFrom === null) return;
    const next = orderAfterDrag(
      pageCount,
      dragFrom,
      toIndex,
      selectedPages,
    );
    setDragFrom(null);
    setDragOver(null);
    if (next) onApplyReorder(next);
  };

  return (
    <Frame className="flex h-full min-h-0 flex-col">
      <FramePanel className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FrameHeader
          title="Organize pages"
          description={`${pageCount} page${pageCount === 1 ? '' : 's'} · drag tiles to reorder`}
          action={
            selectedPages.length > 0 ? (
              <Badge variant="secondary" className="text-[10px]">
                {selectedPages.length} selected
              </Badge>
            ) : null
          }
        />

        <OrganizeActions
          hasSelection={hasSelection}
          selectedPages={selectedPages}
          primary={primary}
          onRotate={onRotate}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onExtract={onExtract}
          onMergeRequest={onMergeRequest}
        />

        <ScrollArea className="min-h-0 flex-1">
          <ul className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: pageCount }, (_, i) => {
              const selected = selectedPages.includes(i);
              const dataUrl = thumbMap.get(i);
              const isDragging = dragFrom === i;
              const isOver = dragOver === i && dragFrom !== null && dragFrom !== i;
              return (
                <li
                  key={i}
                  draggable
                  onDragStart={(e) => {
                    setDragFrom(i);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(i));
                    if (!selectedPages.includes(i)) {
                      onSelectPages([i]);
                    }
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOver !== i) setDragOver(i);
                  }}
                  onDragLeave={() => {
                    if (dragOver === i) setDragOver(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyDrop(i);
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-grabbed={isDragging}
                    aria-label={`Page ${i + 1}. Drag to reorder.`}
                    className={cn(
                      'group flex w-full cursor-grab flex-col gap-1 rounded-md border p-1.5 text-left transition-colors active:cursor-grabbing',
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border/80 hover:border-border hover:bg-muted/40',
                      currentPage === i && 'ring-1 ring-primary/40',
                      isDragging && 'opacity-45',
                      isOver && 'border-primary border-dashed bg-primary/10 ring-2 ring-primary/30',
                    )}
                    onClick={(e) => {
                      if (e.shiftKey || e.metaKey || e.ctrlKey) {
                        onSelectPages(togglePage(selectedPages, i));
                      } else {
                        onSelectPages([i]);
                        onJump(i);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectPages([i]);
                        onJump(i);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1.5 px-0.5">
                      <GripVertical
                        className="size-3.5 shrink-0 text-muted-foreground/70"
                        aria-hidden
                      />
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
                    <div className="pointer-events-none aspect-[3/4] w-full overflow-hidden rounded bg-muted/50">
                      {dataUrl ? (
                        <img
                          src={dataUrl}
                          alt={`Page ${i + 1}`}
                          className="h-full w-full object-contain"
                          draggable={false}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                          Page {i + 1}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </FramePanel>
    </Frame>
  );
}
