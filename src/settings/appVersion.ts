/** Keep in sync with package.json / tauri.conf.json version. */
export const APP_VERSION = '1.4.4';

export const APP_NAME = 'pdf_editor';

/** GitHub repo used for release / update checks (Windows + macOS). */
export const UPDATE_REPO = {
  owner: 'Salutatorian',
  name: 'the-pdf-editor',
} as const;

export function releasesUrl(): string {
  return `https://github.com/${UPDATE_REPO.owner}/${UPDATE_REPO.name}/releases`;
}

export function latestReleaseApiUrl(): string {
  return `https://api.github.com/repos/${UPDATE_REPO.owner}/${UPDATE_REPO.name}/releases/latest`;
}
