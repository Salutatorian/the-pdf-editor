import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Frame, FramePanel } from '@/components/frame';

export type SaveConfirmInfo = {
  filename: string;
  location: string;
  fileSize: string;
  timestamp: string;
};

export type SaveConfirmModalProps = {
  open: boolean;
  info: SaveConfirmInfo;
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
};

export function SaveConfirmModal({
  open,
  info,
  onConfirm,
  onCancel,
  confirming = false,
}: SaveConfirmModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save verified</DialogTitle>
          <DialogDescription>
            Structure checks passed and the file reopened successfully.
          </DialogDescription>
        </DialogHeader>

        <Frame>
          <FramePanel className="overflow-hidden">
            <dl className="divide-y divide-border/60 text-sm">
              {(
                [
                  ['Filename', info.filename],
                  ['Location', info.location],
                  ['Size', info.fileSize],
                  ['Timestamp', info.timestamp],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="grid grid-cols-[5.5rem_1fr] gap-3 px-3 py-2"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="truncate font-medium" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </FramePanel>
        </Frame>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={confirming}>
            Close
          </Button>
          <Button onClick={onConfirm} disabled={confirming}>
            {confirming ? 'Working…' : 'Done'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
