import { loadAppSettings, patchAppSettings } from './appSettings.ts';

export type ThemeMode = 'light' | 'dark';

const THEME_COLOR = {
  light: '#f4f6f8',
  dark: '#0e1012',
} as const;

export function normalizeTheme(value: unknown): ThemeMode {
  return value === 'dark' ? 'dark' : 'light';
}

export function getTheme(): ThemeMode {
  return normalizeTheme(loadAppSettings().theme);
}

/** Apply theme to the document (class + meta). Does not persist. */
export function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute('content', THEME_COLOR[theme]);
  }
  const colorScheme = document.querySelector('meta[name="color-scheme"]');
  if (colorScheme) {
    colorScheme.setAttribute('content', theme);
  }
}

/** Persist + apply. Returns the theme that was set. */
export function setTheme(theme: ThemeMode): ThemeMode {
  const next = normalizeTheme(theme);
  patchAppSettings({ theme: next });
  applyTheme(next);
  return next;
}

export function toggleTheme(): ThemeMode {
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

/** Call once before React mounts to avoid a light flash when dark is saved. */
export function initThemeFromStorage(): ThemeMode {
  const theme = getTheme();
  applyTheme(theme);
  return theme;
}
