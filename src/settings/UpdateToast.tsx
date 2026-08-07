import { Button } from '@/components/ui/button';
import type { UpdateInfo, UpdateProgress } from './updateService.ts';

export type UpdateToastProps = {
  update: UpdateInfo;
  installing?: boolean;
  progress?: UpdateProgress | null;
  onUpdate: () => void;
  onCancel: () => void;
};

function progressLabel(progress: UpdateProgress | null | undefined): string {
  if (!progress) return 'Downloading update…';
  if (progress.contentLength && progress.contentLength > 0) {
    const pct = Math.min(
      100,
      Math.round((progress.downloaded / progress.contentLength) * 100),
    );
    return `Downloading update… ${pct}%`;
  }
  return 'Downloading update…';
}

export function UpdateToast({
  update,
  installing = false,
  progress = null,
  onUpdate,
  onCancel,
}: UpdateToastProps) {
  return (
    <div
      className="fixed right-4 bottom-4 z-[60] w-[min(100%-2rem,22rem)] rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium text-foreground">
        {installing ? 'Updating' : 'Update available'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {installing
          ? progressLabel(progress)
          : `Version ${update.version} is ready. Installs in the app — no manual download.`}
      </p>
      {installing && progress?.contentLength ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{
              width: `${Math.min(
                100,
                Math.round(
                  (progress.downloaded / progress.contentLength) * 100,
                ),
              )}%`,
            }}
          />
        </div>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          disabled={installing}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          type="button"
          disabled={installing}
          onClick={onUpdate}
        >
          {installing ? 'Installing…' : 'Update'}
        </Button>
      </div>
    </div>
  );
}
