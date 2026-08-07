import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
          <span className="block truncate text-sm font-medium text-foreground">
            {file.name}
          </span>
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
  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 320 });

  useLayoutEffect(() => {
    if (!open || !triggerWrapRef.current) return;
    const update = () => {
      const r = triggerWrapRef.current!.getBoundingClientRect();
      const width = Math.min(352, Math.max(260, window.innerWidth - 16));
      let left = r.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      setMenuPos({
        top: r.bottom + 4,
        left,
        width,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Use click (not mousedown) so menu item clicks finish before outside-close
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerWrapRef.current?.contains(t) ||
        menuRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Defer so the opening click doesn't immediately close
    const timer = window.setTimeout(() => {
      document.addEventListener('click', onDoc);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
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

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Recent files"
          className="fixed z-[200] overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-lg"
          style={{
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
            <span className="text-xs font-medium text-foreground">
              Recent files
            </span>
            {files.length > 0 ? (
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => onClear()}
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
                    setOpen(false);
                    onOpen(f.path, f.name);
                  }}
                  onRemove={() => onRemove(f.path)}
                />
              ))}
            </ul>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={triggerWrapRef} className="relative">
      <Button
        type="button"
        variant={open ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground"
        title="Recent files"
        aria-label={`Recent files${files.length ? ` (${files.length})` : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Clock3 className="size-3.5" />
        <span className="hidden text-[11px] sm:inline">Recent</span>
        {files.length > 0 ? (
          <span className="rounded bg-muted px-1 font-mono text-[10px] tabular-nums text-muted-foreground">
            {files.length}
          </span>
        ) : null}
      </Button>
      {menu}
    </div>
  );
}
