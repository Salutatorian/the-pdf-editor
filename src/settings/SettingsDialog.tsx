import { useEffect, useState } from 'react';
import {
  Settings,
  Minus,
  X,
  Power,
  RefreshCw,
  ScrollText,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { isTauri } from '../persistence/fileService.ts';
import { APP_VERSION } from './appVersion.ts';
import {
  loadAppSettings,
  patchAppSettings,
  type AppSettings,
} from './appSettings.ts';
import {
  getOpenAtLoginEnabled,
  setOpenAtLoginEnabled,
} from './autostart.ts';
import {
  CHANGELOG,
  kindLabel,
  type ChangelogRelease,
} from './changelog.ts';
import {
  checkForAppUpdate,
  openUpdateDownload,
  type UpdateInfo,
} from './updateService.ts';
import { closeAppWindow, minimizeAppWindow } from './windowActions.ts';

export type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateAvailable: UpdateInfo | null;
  onUpdateAvailable: (info: UpdateInfo | null) => void;
  onShowWhatsNew: (version: string) => void;
};

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        className="mt-1 size-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function ReleaseNotes({ release }: { release: ChangelogRelease }) {
  return (
    <div className="space-y-2 rounded-lg border border-border/80 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">
          {release.version}{' '}
          <span className="font-normal text-muted-foreground">
            · {release.title}
          </span>
        </h4>
        <span className="text-[10px] text-muted-foreground">{release.date}</span>
      </div>
      <ul className="space-y-1">
        {release.items.map((item) => (
          <li
            key={`${release.version}-${item.kind}-${item.text}`}
            className="text-xs text-foreground/85"
          >
            <span className="font-medium text-muted-foreground">
              {kindLabel(item.kind)}:
            </span>{' '}
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  updateAvailable,
  onUpdateAvailable,
  onShowWhatsNew,
}: SettingsDialogProps) {
  const [, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [panel, setPanel] = useState<'general' | 'notes'>('general');
  const desktop = isTauri();

  useEffect(() => {
    if (!open) return;
    setSettings(loadAppSettings());
    setPanel('general');
    setStatus(null);
    void (async () => {
      const enabled = await getOpenAtLoginEnabled();
      setOpenAtLogin(enabled);
      const prefs = loadAppSettings();
      if (prefs.openAtLogin !== enabled) {
        setSettings(patchAppSettings({ openAtLogin: enabled }));
      }
    })();
  }, [open]);

  const onToggleLogin = async (next: boolean) => {
    setBusy(true);
    setStatus(null);
    const result = await setOpenAtLoginEnabled(next);
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error ?? 'Could not change launch at login');
      return;
    }
    setOpenAtLogin(next);
    setSettings(patchAppSettings({ openAtLogin: next }));
  };

  const onCheckUpdates = async () => {
    setChecking(true);
    setStatus(null);
    const info = await checkForAppUpdate();
    setChecking(false);
    if (!info) {
      setStatus(`You're up to date (v${APP_VERSION}).`);
      onUpdateAvailable(null);
      return;
    }
    onUpdateAvailable(info);
    setStatus(`Version ${info.version} is available.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(88vh,680px)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Settings className="size-4 opacity-80" />
            Settings
          </DialogTitle>
          <DialogDescription className="text-xs">
            pdf_editor v{APP_VERSION}
            {desktop ? ' · Desktop' : ' · Browser preview'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border px-3 pt-2">
          <Button
            type="button"
            variant={panel === 'general' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => setPanel('general')}
          >
            General
          </Button>
          <Button
            type="button"
            variant={panel === 'notes' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() => setPanel('notes')}
          >
            <ScrollText className="size-3" />
            Release notes
            {updateAvailable ? (
              <span
                className="size-1.5 rounded-full bg-destructive"
                aria-hidden
              />
            ) : null}
          </Button>
        </div>

        <div className="max-h-[min(60vh,480px)] space-y-4 overflow-y-auto px-5 py-4">
          {panel === 'general' ? (
            <>
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <Monitor className="size-3" />
                  Window
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={!desktop || busy}
                    onClick={() => void minimizeAppWindow()}
                  >
                    <Minus className="size-3.5" />
                    Minimize
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={!desktop || busy}
                    onClick={() => void closeAppWindow()}
                  >
                    <X className="size-3.5" />
                    Close
                  </Button>
                </div>
                {!desktop ? (
                  <p className="text-xs text-muted-foreground">
                    Window controls work in the desktop app on Windows and
                    macOS.
                  </p>
                ) : null}
              </section>

              <Separator />

              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <Power className="size-3" />
                  Startup
                </h3>
                <ToggleRow
                  label="Open when computer starts"
                  description="Off by default. Uses Login Items on macOS and Startup apps on Windows."
                  checked={openAtLogin}
                  disabled={!desktop || busy}
                  onChange={(v) => void onToggleLogin(v)}
                />
              </section>

              <Separator />

              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <RefreshCw className="size-3" />
                  Updates
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={checking}
                    onClick={() => void onCheckUpdates()}
                  >
                    {checking ? 'Checking…' : 'Check for updates'}
                  </Button>
                  {updateAvailable ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void openUpdateDownload(updateAvailable)}
                    >
                      Update to {updateAvailable.version}
                    </Button>
                  ) : null}
                </div>
                {updateAvailable ? (
                  <p className="text-xs text-muted-foreground">
                    An update is available. After you install and reopen, you
                    will see What&apos;s New once.
                  </p>
                ) : null}
              </section>

              {status ? (
                <p className="text-xs text-muted-foreground">{status}</p>
              ) : null}
            </>
          ) : (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Browse changes anytime. After an update, What&apos;s New only
                  appears once until you continue.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 text-[11px]"
                  onClick={() => onShowWhatsNew(APP_VERSION)}
                >
                  View current
                </Button>
              </div>
              {CHANGELOG.map((release) => (
                <ReleaseNotes key={release.version} release={release} />
              ))}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
