import {
  APP_VERSION,
  latestReleaseApiUrl,
  releasesUrl,
  UPDATE_REPO,
} from './appVersion.ts';
import { isTauri } from '../persistence/fileService.ts';

export type UpdateInfo = {
  version: string;
  body: string | null;
  htmlUrl: string;
};

export type UpdateProgress = {
  downloaded: number;
  contentLength: number | null;
};

function parseSemver(v: string): number[] {
  const cleaned = v.trim().replace(/^v/i, '');
  return cleaned.split('.').map((part) => {
    const n = Number.parseInt(part.replace(/[^0-9].*$/, ''), 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** true if `remote` is strictly newer than `local`. */
export function isNewerVersion(remote: string, local: string): boolean {
  const a = parseSemver(remote);
  const b = parseSemver(local);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/** Only open update links on our GitHub repo (blocks open-redirect / phishing). */
export function isAllowedUpdateUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== 'github.com') return false;
    const prefix = `/${UPDATE_REPO.owner}/${UPDATE_REPO.name}`;
    return u.pathname === prefix || u.pathname.startsWith(`${prefix}/`);
  } catch {
    return false;
  }
}

async function checkViaGitHubApi(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(latestReleaseApiUrl(), {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tag_name?: string;
      body?: string;
      html_url?: string;
    };
    const version = data.tag_name?.replace(/^v/i, '') ?? '';
    if (!version || !isNewerVersion(version, APP_VERSION)) return null;
    const htmlUrl = data.html_url || releasesUrl();
    if (!isAllowedUpdateUrl(htmlUrl)) return null;
    return {
      version,
      body: typeof data.body === 'string' ? data.body.slice(0, 4000) : null,
      htmlUrl,
    };
  } catch {
    return null;
  }
}

/** Prefer Tauri updater endpoint; fall back to GitHub Releases API. */
export async function checkForAppUpdate(): Promise<UpdateInfo | null> {
  if (isTauri()) {
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        return {
          version: update.version,
          body: update.body ?? null,
          htmlUrl: releasesUrl(),
        };
      }
      return null;
    } catch {
      // Fall through to GitHub API (e.g. missing latest.json on older releases)
    }
  }
  return checkViaGitHubApi();
}

export async function openUpdateDownload(info: UpdateInfo): Promise<void> {
  const url = isAllowedUpdateUrl(info.htmlUrl) ? info.htmlUrl : releasesUrl();
  if (!isAllowedUpdateUrl(url)) return;

  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
      return;
    } catch {
      // fall through
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Download + install the update in-app, then relaunch.
 * Never opens a browser — returns 'failed' if the updater can't install.
 */
export async function installAppUpdate(
  info: UpdateInfo,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<'installed' | 'failed'> {
  if (!isTauri()) {
    return 'failed';
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const { relaunch } = await import('@tauri-apps/plugin-process');
    const update = await check();
    if (!update) {
      console.error(
        'Updater check returned no update (expected',
        info.version,
        ')',
      );
      return 'failed';
    }

    let downloaded = 0;
    let contentLength: number | null = null;
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        contentLength = event.data.contentLength ?? null;
        downloaded = 0;
        onProgress?.({ downloaded, contentLength });
        return;
      }
      if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, contentLength });
        return;
      }
      if (event.event === 'Finished') {
        onProgress?.({ downloaded, contentLength });
      }
    });
    await relaunch();
    return 'installed';
  } catch (err) {
    console.error('In-app update failed', err);
    return 'failed';
  }
}
