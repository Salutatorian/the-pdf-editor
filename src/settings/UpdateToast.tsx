import { Button } from '@/components/ui/button';
import type { UpdateInfo } from './updateService.ts';

export type UpdateToastProps = {
  update: UpdateInfo;
  onUpdate: () => void;
  onCancel: () => void;
};

export function UpdateToast({ update, onUpdate, onCancel }: UpdateToastProps) {
  return (
    <div
      className="fixed right-4 bottom-4 z-[60] w-[min(100%-2rem,22rem)] rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium text-foreground">Update available</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Version {update.version} is ready. You can update now or keep working.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" type="button" onClick={onUpdate}>
          Update
        </Button>
      </div>
    </div>
  );
}
