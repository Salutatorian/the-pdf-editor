import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export type ThumbnailItem = {
  pageIndex: number;
  label?: string;
  dataUrl?: string | null;
};

export type ThumbnailSidebarProps = {
  pages: ThumbnailItem[];
  currentPage: number;
  onPageSelect: (pageIndex: number) => void;
  title?: string;
};

export function ThumbnailSidebar({
  pages,
  currentPage,
  onPageSelect,
  title = 'Pages',
}: ThumbnailSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {pages.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">No pages</p>
        ) : (
          <ul className="flex flex-col gap-2 p-2" aria-label="Document pages">
            {pages.map((page) => {
              const pageNumber = page.pageIndex + 1;
              const isCurrent = page.pageIndex === currentPage;
              const label = page.label ?? `Page ${pageNumber}`;

              return (
                <li key={page.pageIndex}>
                  <button
                    type="button"
                    aria-label={label}
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={() => onPageSelect(page.pageIndex)}
                    className={cn(
                      'flex w-full flex-col items-center gap-1 rounded-md border p-1.5 text-[10px] tabular-nums transition-colors',
                      isCurrent
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background/40 text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {page.dataUrl ? (
                      <img
                        src={page.dataUrl}
                        alt=""
                        draggable={false}
                        decoding="async"
                        className="pdf-thumb aspect-[8.5/11] w-full rounded-sm border border-border object-contain bg-white"
                        style={{ imageRendering: 'auto' }}
                      />
                    ) : (
                      <div className="flex aspect-[8.5/11] w-full items-center justify-center rounded-sm border border-border bg-muted text-muted-foreground">
                        {pageNumber}
                      </div>
                    )}
                    <span>{pageNumber}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
