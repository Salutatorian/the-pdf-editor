export type ChangelogKind = 'added' | 'fixed' | 'removed' | 'improved' | 'debug';

export type ChangelogItem = {
  kind: ChangelogKind;
  text: string;
};

export type ChangelogRelease = {
  version: string;
  title: string;
  date: string;
  items: ChangelogItem[];
};

/**
 * Newest first. When you ship a release, bump APP_VERSION and add an entry here
 * so the What's New modal and Settings → Release notes stay accurate.
 */
export const CHANGELOG: readonly ChangelogRelease[] = [
  {
    version: '1.2.0',
    title: 'Light UI · safer save · release builds',
    date: '2026-08-07',
    items: [
      {
        kind: 'improved',
        text: 'Light mode only — clean paper shell (no dark theme)',
      },
      {
        kind: 'added',
        text: 'Windows, macOS, and Linux installers via GitHub Releases',
      },
      {
        kind: 'fixed',
        text: 'Open/switch PDF no longer freezes or kills mode buttons',
      },
      {
        kind: 'fixed',
        text: 'Save never deletes your original before replace succeeds',
      },
      {
        kind: 'improved',
        text: 'Hardened file paths, PDF size limits, and update URL allowlist',
      },
      {
        kind: 'improved',
        text: 'View/Fill scroll cleanly — overlays only capture clicks in Add/Sign',
      },
    ],
  },
  {
    version: '0.1.0',
    title: 'First desktop release',
    date: '2026-08-06',
    items: [
      {
        kind: 'added',
        text: 'Live save that bakes filled wording into the real PDF file',
      },
      {
        kind: 'added',
        text: 'Smooth pen-style signature drawing (Bezier + pressure-by-speed)',
      },
      {
        kind: 'added',
        text: 'Settings with window controls, launch at login, and updates',
      },
      {
        kind: 'fixed',
        text: 'Fillable fields stay aligned when zooming',
      },
      {
        kind: 'fixed',
        text: 'Add Text tool strip no longer overlaps the main toolbar',
      },
      {
        kind: 'improved',
        text: 'Sharper page thumbnails and Smart Fill checkbox gaps',
      },
      {
        kind: 'improved',
        text: 'Cross-platform desktop shell (Windows today, macOS-ready)',
      },
    ],
  },
] as const;

export function changelogForVersion(
  version: string,
): ChangelogRelease | undefined {
  return CHANGELOG.find((r) => r.version === version);
}

export function latestChangelog(): ChangelogRelease | undefined {
  return CHANGELOG[0];
}

export function kindLabel(kind: ChangelogKind): string {
  switch (kind) {
    case 'added':
      return 'Added';
    case 'fixed':
      return 'Fixed';
    case 'removed':
      return 'Removed';
    case 'improved':
      return 'Improved';
    case 'debug':
      return 'Debug';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
