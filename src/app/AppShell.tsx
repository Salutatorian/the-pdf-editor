import { useCallback, useState, type DragEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export type StatusTone = 'default' | 'success' | 'warning' | 'error';

export type AppShellProps = {
  children?: ReactNode;
  toolbar?: ReactNode;
  sidebar?: ReactNode;
  properties?: ReactNode;
  statusMessage?: ReactNode;
  statusTone?: StatusTone;
  pageLabel?: string;
  zoomLabel?: string;
  statusMeta?: ReactNode;
  sidebarCollapsed?: boolean;
  propertiesCollapsed?: boolean;
  onDropFiles?: (files: File[]) => void;
};

function toneClass(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return 'text-success';
    case 'warning':
      return 'text-warning';
    case 'error':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}

export function AppShell({
  children,
  toolbar,
  sidebar,
  properties,
  statusMessage,
  statusTone = 'default',
  pageLabel,
  zoomLabel,
  statusMeta,
  sidebarCollapsed = false,
  propertiesCollapsed = false,
  onDropFiles,
}: AppShellProps) {
  const [dragging, setDragging] = useState(false);

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) setDragging(true);
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) setDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) =>
          f.type === 'application/pdf' ||
          f.name.toLowerCase().endsWith('.pdf'),
      );
      if (files.length > 0) onDropFiles?.(files);
    },
    [onDropFiles],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {toolbar ? (
        <header className="relative z-40 shrink-0 overflow-visible border-b border-border bg-card/60 backdrop-blur-sm">
          {toolbar}
        </header>
      ) : null}

      <div
        className={cn(
          'grid min-h-0 flex-1',
          sidebarCollapsed && propertiesCollapsed
            ? 'grid-cols-1'
            : sidebarCollapsed
              ? 'grid-cols-[minmax(0,1fr)_var(--props-w)]'
              : propertiesCollapsed
                ? 'grid-cols-[var(--sidebar-w)_minmax(0,1fr)]'
                : 'grid-cols-[var(--sidebar-w)_minmax(0,1fr)_var(--props-w)]',
        )}
      >
        {!sidebarCollapsed ? (
          <aside
            className="min-h-0 overflow-hidden border-r border-border bg-sidebar"
            aria-label="Page thumbnails"
          >
            {sidebar}
          </aside>
        ) : null}

        <main
          className="relative min-h-0 overflow-hidden bg-dot-grid"
          aria-label="Document canvas"
        >
          <div className="h-full min-h-0 overflow-auto">{children}</div>
          {dragging ? (
            <div
              className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-[2px]"
              aria-hidden
            >
              <div className="rounded-xl border border-primary/50 bg-card px-6 py-4 text-sm font-medium text-primary shadow-lg">
                Drop PDF to open
              </div>
            </div>
          ) : null}
        </main>

        {!propertiesCollapsed ? (
          <aside
            className="min-h-0 overflow-hidden border-l border-border bg-sidebar"
            aria-label="Properties"
          >
            {properties}
          </aside>
        ) : null}
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-border bg-card/50 px-3 text-[11px]">
        <span className={cn('min-w-0 flex-1 truncate', toneClass(statusTone))}>
          {statusMessage}
        </span>
        {statusMeta}
        <Separator orientation="vertical" className="mx-1 h-3" />
        {pageLabel ? (
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 font-normal">
            {pageLabel}
          </Badge>
        ) : null}
        {zoomLabel ? (
          <Badge variant="secondary" className="h-5 rounded-sm px-1.5 font-normal">
            {zoomLabel}
          </Badge>
        ) : null}
      </footer>
    </div>
  );
}
