import { isTauri } from '../persistence/fileService.ts';

/** Minimize the main window (no-op in browser). Works on Windows, macOS, Linux. */
export async function minimizeAppWindow(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
    return true;
  } catch {
    return false;
  }
}

/** Close the main window (no-op in browser). Works on Windows, macOS, Linux. */
export async function closeAppWindow(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
    return true;
  } catch {
    return false;
  }
}

/**
 * After native file dialogs / window.confirm, Radix menus/tooltips can leave
 * body { pointer-events: none } and the webview may not regain focus — so the
 * whole toolbar looks dead. Call this after every Open path.
 */
export async function restoreUiAfterNativeDialog(): Promise<void> {
  try {
    document.body.style.pointerEvents = '';
    document.documentElement.style.pointerEvents = '';
    document.body.style.overflow = '';
    document.body.removeAttribute('data-scroll-locked');
    document.body.removeAttribute('data-aria-hidden');
  } catch {
    // ignore
  }

  try {
    window.focus();
  } catch {
    // ignore
  }

  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    await win.setFocus();
    await win.show();
  } catch {
    // ignore
  }
}
