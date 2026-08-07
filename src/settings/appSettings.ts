const STORAGE_KEY = 'pdf_editor.settings.v1';

export type ThemePreference = 'light' | 'dark';

export type AppSettings = {
  /** Preference only — OS login item is applied via Tauri autostart. Default off. */
  openAtLogin: boolean;
  /** UI theme. Default light. */
  theme: ThemePreference;
  /** Last app version that finished a launch (used to detect upgrades). */
  lastLaunchedVersion: string | null;
  /** Changelog version the user already dismissed with Continue. */
  lastSeenChangelogVersion: string | null;
  /** Update toast dismissed for this remote version (badge can still show). */
  dismissedUpdateVersion: string | null;
};

const DEFAULTS: AppSettings = {
  openAtLogin: false,
  theme: 'light',
  lastLaunchedVersion: null,
  lastSeenChangelogVersion: null,
  dismissedUpdateVersion: null,
};

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function loadAppSettings(): AppSettings {
  if (!canUseStorage()) return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      openAtLogin: Boolean(parsed.openAtLogin),
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      lastLaunchedVersion:
        typeof parsed.lastLaunchedVersion === 'string'
          ? parsed.lastLaunchedVersion
          : null,
      lastSeenChangelogVersion:
        typeof parsed.lastSeenChangelogVersion === 'string'
          ? parsed.lastSeenChangelogVersion
          : null,
      dismissedUpdateVersion:
        typeof parsed.dismissedUpdateVersion === 'string'
          ? parsed.dismissedUpdateVersion
          : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAppSettings(next: AppSettings): void {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function patchAppSettings(
  patch: Partial<AppSettings>,
): AppSettings {
  const merged = { ...loadAppSettings(), ...patch };
  saveAppSettings(merged);
  return merged;
}
