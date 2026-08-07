import { useEffect, useRef, useState } from 'react';
import { Clock3, FileText, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RecentFileEntry } from '@/document/types';
import { formatOpenedAt } from '@/persistence/formatOpenedAt';

export type RecentFilesMenuProps = {
  files: RecentFileEntry[];
  onOpen: (path: string, name: string) => void;
  onRemove: (path: string) => void;
  onClear: () => void;
  /** Compact toolbar trigger vs full empty-state panel */
  variant?: 'toolbar' | 'panel';
};

function RecentFileRow({
  file,
  onOpen,
  onRemove,
}: {
  file: RecentFileEntry;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="group flex items-stretch gap-0.5">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
        onClick={onOpen}
        title={file.path}
      >
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{file.name}</span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {formatOpenedAt(file.openedAt)}
            {file.path !== file.name ? ` · ${file.path}` : ''}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="shrink-0 rounded-md px-2 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Remove ${file.name} from recent`}
        title="Remove from recent"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

export function RecentFilesMenu({
  files,
  onOpen,
  onRemove,
  onClear,
  variant = 'toolbar',
}: RecentFilesMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        rootRef.current?.removeAttribute('open');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (variant === 'panel') {
    if (files.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-border/80 px-4 py-6 text-center">
          <Clock3 className="mx-auto size-5 text-muted-foreground/70" />
          <p className="mt-2 text-sm text-muted-foreground">
            Recent files will show up here after you open a PDF.
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <Clock3 className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">Recent files</span>
          <span className="text-[11px] text-muted-foreground">
            {files.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1 px-2 text-[11px] text-muted-foreground"
            onClick={onClear}
          >
            <Trash2 className="size-3" />
            Clear
          </Button>
        </div>
        <ul className="max-h-56 divide-y divide-border/50 overflow-y-auto p-1">
          {files.map((f) => (
            <RecentFileRow
              key={f.path}
              file={f}
              onOpen={() => onOpen(f.path, f.name)}
              onRemove={() => onRemove(f.path)}
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <details
      ref={rootRef}
      className="relative"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary
        className="flex h-7 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden"
        title="Recent files"
        aria-label={`Recent files${files.length ? ` (${files.length})` : ''}`}
      >
        <Clock3 className="size-3.5" />
        <span className="hidden text-[11px] sm:inline">Recent</span>
        {files.length > 0 ? (
          <span className="rounded bg-muted px-1 font-mono text-[10px] tabular-nums text-muted-foreground">
            {files.length}
          </span>
        ) : null}
      </summary>
      <div className="absolute left-0 z-50 mt-1 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
          <span className="text-xs font-medium">Recent files</span>
          {files.length > 0 ? (
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                onClear();
              }}
            >
              Clear all
            </button>
          ) : null}
        </div>
        {files.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            No recent PDFs yet. Open a file to start the list.
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto p-1">
            {files.map((f) => (
              <RecentFileRow
                key={f.path}
                file={f}
                onOpen={() => {
                  onOpen(f.path, f.name);
                  setOpen(false);
                  rootRef.current?.removeAttribute('open');
                }}
                onRemove={() => onRemove(f.path)}
              />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
