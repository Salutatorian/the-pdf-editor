import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Frame, FramePanel } from '@/components/frame';
import { groupShortcutsByCategory } from './shortcuts.ts';

export type ShortcutsHelpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ShortcutsHelpDialog({
  open,
  onOpenChange,
}: ShortcutsHelpDialogProps) {
  const groups = groupShortcutsByCategory();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85vh,640px)] max-w-lg gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="size-4 opacity-80" />
            Keyboard & mouse shortcuts
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Ctrl means ⌘ Command on macOS. Zoom also works with Ctrl + scroll
            wheel, or Ctrl + hold middle mouse and drag up/down.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(65vh,520px)] overflow-y-auto px-5 py-3">
          <Frame className="gap-3">
            {groups.map(({ category, items }) => (
              <FramePanel key={category} className="gap-2 p-3">
                <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {category}
                </h3>
                <ul className="space-y-1.5">
                  {items.map((item) => (
                    <li
                      key={`${item.action}-${item.keys}-${item.label}`}
                      className="flex items-baseline justify-between gap-4 text-sm"
                    >
                      <span className="text-foreground/90">{item.label}</span>
                      <kbd className="shrink-0 rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {item.keys}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </FramePanel>
            ))}
          </Frame>
        </div>
        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
