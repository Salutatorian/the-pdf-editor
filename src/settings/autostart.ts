import { isTauri } from '../persistence/fileService.ts';

/**
 * Launch at login — off by default.
 * Uses Tauri autostart (Login Items on macOS, Startup on Windows, XDG on Linux).
 */
export async function getOpenAtLoginEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { isEnabled } = await import('@tauri-apps/plugin-autostart');
    return await isEnabled();
  } catch {
    return false;
  }
}

export async function setOpenAtLoginEnabled(
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!isTauri()) {
    return {
      ok: false,
      error: 'Open at login needs the desktop app (Windows or macOS).',
    };
  }
  try {
    const { enable, disable } = await import('@tauri-apps/plugin-autostart');
    if (enabled) await enable();
    else await disable();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
