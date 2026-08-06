import {
  FileUp,
  PenLine,
  FormInput,
  Clock3,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Frame, FramePanel } from '@/components/frame';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { RecentFileEntry } from '@/document/types';

export type EmptyStateProps = {
  recentFiles: RecentFileEntry[];
  onOpen: () => void;
  onOpenRecent: (path: string, name: string) => void;
  onFileInput: (file: File) => void;
};

const ACTIONS: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
}> = [
  {
    icon: FileUp,
    title: 'Open',
    description: 'Load a local PDF — dialog or drag & drop.',
    badge: 'Ctrl+O',
  },
  {
    icon: FormInput,
    title: 'Fill',
    description: 'AcroForm fields and Smart Fill suggestions.',
  },
  {
    icon: PenLine,
    title: 'Sign',
    description: 'Draw, type, or import a visual signature.',
  },
];

export function EmptyState({
  recentFiles,
  onOpen,
  onOpenRecent,
  onFileInput,
}: EmptyStateProps) {
  return (
    <div
      className="flex min-h-full items-center justify-center p-8"
      data-testid="empty-state"
    >
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="text-center">
          <h1 className="font-sans text-4xl font-semibold tracking-tight text-foreground">
            pdf<span className="text-primary">_editor</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            View, fill, annotate, and sign — with verified save you can trust.
          </p>
          <div className="mt-5 flex justify-center">
            <Button size="sm" onClick={onOpen} data-testid="open-pdf">
              <FileUp className="size-4" />
              Open PDF
            </Button>
          </div>
        </div>

        {/* ReUI-inspired action cards — interaction surfaces, not KPI tiles */}
        <div className="@container grid gap-3 sm:grid-cols-3">
          {ACTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <Frame key={item.title}>
                <FramePanel className="p-4 transition-colors hover:bg-accent/40">
                  <div className="mb-3 flex size-9 items-center justify-center rounded-lg border border-border bg-secondary">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{item.title}</div>
                    {item.badge ? (
                      <Badge
                        variant="outline"
                        className="h-4 px-1 text-[9px] font-normal"
                      >
                        {item.badge}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </FramePanel>
              </Frame>
            );
          })}
        </div>

        {recentFiles.length > 0 ? (
          <Frame>
            <FramePanel>
              <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
                <Clock3 className="size-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">Recent files</span>
              </div>
              <ScrollArea className="max-h-48">
                <ul className="divide-y divide-border/60 p-1">
                  {recentFiles.map((f) => (
                    <li key={f.path}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                        onClick={() => onOpenRecent(f.path, f.name)}
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {f.name}
                        </span>
                        <span className="max-w-[40%] truncate text-[11px] text-muted-foreground">
                          {f.path}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </FramePanel>
          </Frame>
        ) : null}

        <input
          data-testid="file-input"
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileInput(file);
          }}
        />
      </div>
    </div>
  );
}
