import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  changelogForVersion,
  kindLabel,
  type ChangelogRelease,
} from './changelog.ts';
import { APP_VERSION } from './appVersion.ts';

export type WhatsNewDialogProps = {
  open: boolean;
  version?: string;
  onContinue: () => void;
};

function ReleaseBody({ release }: { release: ChangelogRelease }) {
  const groups = (
    ['added', 'fixed', 'removed', 'improved', 'debug'] as const
  ).map((kind) => ({
    kind,
    items: release.items.filter((i) => i.kind === kind),
  }));

  return (
    <div className="space-y-4">
      {groups.map(({ kind, items }) =>
        items.length === 0 ? null : (
          <section key={kind} className="space-y-1.5">
            <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {kindLabel(kind)}
            </h3>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li
                  key={`${kind}-${item.text}`}
                  className="flex gap-2 text-sm text-foreground/90"
                >
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

export function WhatsNewDialog({
  open,
  version = APP_VERSION,
  onContinue,
}: WhatsNewDialogProps) {
  const release =
    changelogForVersion(version) ??
    ({
      version,
      title: `Version ${version}`,
      date: '',
      items: [],
    } satisfies ChangelogRelease);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onContinue();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/55 backdrop-blur-md"
        className="max-h-[min(85vh,640px)] gap-0 overflow-hidden p-0 sm:max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="border-b border-border bg-card/80 px-5 py-4 backdrop-blur-sm">
          <DialogHeader className="gap-1 text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
              What&apos;s new in {release.version}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {release.title}
              {release.date ? ` · ${release.date}` : ''}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="max-h-[min(55vh,420px)] overflow-y-auto px-5 py-4">
          {release.items.length > 0 ? (
            <ReleaseBody release={release} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Thanks for updating. You&apos;re on the latest build.
            </p>
          )}
        </div>
        <DialogFooter className="border-t border-border px-5 py-3 sm:justify-end">
          <Button type="button" onClick={onContinue}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
