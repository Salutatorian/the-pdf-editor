import { loadAppSettings, patchAppSettings } from './appSettings.ts';

export type ThemeMode = 'light' | 'dark' | 'black';

const THEME_COLOR = {
  light: '#f4f6f8',
  dark: '#0e1012',
  black: '#000000',
} as const;

export function normalizeTheme(value: unknown): ThemeMode {
  return value === 'dark' || value === 'black' ? value : 'light';
}

export function getTheme(): ThemeMode {
  return normalizeTheme(loadAppSettings().theme);
}

/** Apply theme to the document (class + meta). Does not persist. */
export function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  // 'black' builds on the dark token set, so it keeps the .dark class too
  root.classList.toggle('dark', theme !== 'light');
  root.classList.toggle('black', theme === 'black');
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';

  // Inverted paper is opt-in and only meaningful in dark/black themes
  root.classList.toggle(
    'paper-dark',
    theme !== 'light' && loadAppSettings().darkPaper,
  );

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute('content', THEME_COLOR[theme]);
  }
  const colorScheme = document.querySelector('meta[name="color-scheme"]');
  if (colorScheme) {
    colorScheme.setAttribute('content', theme === 'light' ? 'light' : 'dark');
  }
}

/** Persist + apply. Returns the theme that was set. */
export function setTheme(theme: ThemeMode): ThemeMode {
  const next = normalizeTheme(theme);
  patchAppSettings({ theme: next });
  applyTheme(next);
  return next;
}

/** light → dark → black → light (toolbar button). */
export function cycleTheme(): ThemeMode {
  const order: ThemeMode[] = ['light', 'dark', 'black'];
  const current = getTheme();
  const next = order[(order.indexOf(current) + 1) % order.length]!;
  return setTheme(next);
}

/** Persist + apply the inverted-paper preference. */
export function setDarkPaper(enabled: boolean): void {
  patchAppSettings({ darkPaper: enabled });
  applyTheme(getTheme());
}

/** Call once before React mounts to avoid a light flash when dark is saved. */
export function initThemeFromStorage(): ThemeMode {
  const theme = getTheme();
  applyTheme(theme);
  return theme;
}
