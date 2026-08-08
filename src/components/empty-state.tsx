import {
  FileUp,
  PenLine,
  FormInput,
  Moon,
  MoonStar,
  Sun,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Frame, FramePanel } from '@/components/frame';
import type { RecentFileEntry } from '@/document/types';
import type { ThemeMode } from '@/settings/theme';
import { RecentFilesMenu } from '@/app/RecentFilesMenu';

export type EmptyStateProps = {
  recentFiles: RecentFileEntry[];
  onOpen: () => void;
  onOpenRecent: (path: string, name: string) => void;
  onRemoveRecent: (path: string) => void;
  onClearRecent: () => void;
  onFileInput: (file: File) => void;
  theme?: ThemeMode;
  onToggleTheme?: () => void;
  onOpenSettings?: () => void;
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
  onRemoveRecent,
  onClearRecent,
  onFileInput,
  theme = 'light',
  onToggleTheme,
  onOpenSettings,
}: EmptyStateProps) {
  return (
    <div
      className="relative flex min-h-full items-center justify-center p-8"
      data-testid="empty-state"
    >
      <div className="absolute top-3 right-3 flex items-center gap-0.5">
        {onToggleTheme ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              theme === 'light'
                ? 'Switch to dark mode'
                : theme === 'dark'
                  ? 'Switch to black mode'
                  : 'Switch to light mode'
            }
            onClick={onToggleTheme}
          >
            {theme === 'light' ? (
              <Moon />
            ) : theme === 'dark' ? (
              <MoonStar />
            ) : (
              <Sun />
            )}
          </Button>
        ) : null}
        {onOpenSettings ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Settings"
            onClick={onOpenSettings}
          >
            <Settings />
          </Button>
        ) : null}
      </div>

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

        <RecentFilesMenu
          variant="panel"
          files={recentFiles}
          onOpen={onOpenRecent}
          onRemove={onRemoveRecent}
          onClear={onClearRecent}
        />

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
