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
    version: '1.4.4',
    title: 'Form fill that matches what you see',
    date: '2026-08-17',
    items: [
      {
        kind: 'fixed',
        text: 'Saved form text no longer blows up huge or centers oddly in browser PDF viewers',
      },
      {
        kind: 'fixed',
        text: 'Fill boxes stay clear of printed titles (e.g. Dates of Employment) instead of covering labels',
      },
      {
        kind: 'fixed',
        text: 'Filled values stay visible in View mode — same as Add Text overlays',
      },
      {
        kind: 'fixed',
        text: 'Save no longer fails on forms with broken AcroForm appearance streams',
      },
      {
        kind: 'improved',
        text: 'Dark scanned pages no longer flip white/dark when zooming',
      },
      {
        kind: 'improved',
        text: 'Narrow date cells shrink type size so full dates fit instead of clipping',
      },
    ],
  },
  {
    version: '1.4.3',
    title: 'In-app updates only',
    date: '2026-08-17',
    items: [
      {
        kind: 'fixed',
        text: 'Update never opens GitHub in the browser — Settings and the toast install inside the app',
      },
      {
        kind: 'fixed',
        text: 'Release CI reliably rebuilds latest.json so Windows/macOS/Linux updates publish together',
      },
      {
        kind: 'improved',
        text: 'If you installed before 1.4.3: install this build once (run the new .exe/.dmg — no need to uninstall). Future updates install from the Update toast',
      },
    ],
  },
  {
    version: '1.4.2',
    title: 'Open with PDF · transparent text typing',
    date: '2026-08-16',
    items: [
      {
        kind: 'fixed',
        text: 'Open with / double-click a PDF now opens that file in the app (not just an empty window)',
      },
      {
        kind: 'added',
        text: 'PDF file association — app appears in Open with; second opens focus the existing window',
      },
      {
        kind: 'fixed',
        text: 'Add Text no longer covers the page with a white box — overlays are transparent',
      },
      {
        kind: 'improved',
        text: 'Click or right-click with Text selected places a box and types immediately (no double-click)',
      },
    ],
  },
  {
    version: '1.4.1',
    title: 'Printing fix · text formatting · black theme',
    date: '2026-08-08',
    items: [
      {
        kind: 'fixed',
        text: 'Printing — pages fit the paper, no more clipped or partial printouts',
      },
      {
        kind: 'added',
        text: 'Bold / italic / underline and font choices for the Add Text tool',
      },
      {
        kind: 'added',
        text: 'True-black (OLED) theme, plus "Dark pages" to invert the paper in dark themes',
      },
      {
        kind: 'fixed',
        text: 'In-app auto-update installs and relaunches on its own — no more trip to the downloads website',
      },
      {
        kind: 'improved',
        text: 'Saved PDFs keep your text formatting and font choices',
      },
      {
        kind: 'improved',
        text: 'Scans and image-heavy PDFs render via built-in JBIG2 / JPEG2000 decoders',
      },
    ],
  },
  {
    version: '1.3.1',
    title: 'Slimmer installers · signature & organize fixes',
    date: '2026-08-08',
    items: [
      {
        kind: 'improved',
        text: 'Release downloads trimmed to Windows .exe, macOS .dmg, and Linux AppImage',
      },
      {
        kind: 'fixed',
        text: 'Signature ink and its frame now move together (no more desync)',
      },
      {
        kind: 'added',
        text: 'Red × on a selected signature/image to remove it',
      },
      {
        kind: 'fixed',
        text: 'Draw pad always starts blank — no blank/ghost signatures on a new file',
      },
      {
        kind: 'improved',
        text: 'Organize: drag page tiles to reorder (removed Up/Down), Rotate is repeatable',
      },
      {
        kind: 'improved',
        text: 'Uninstalling from Windows wipes all saved signatures, settings, and caches',
      },
    ],
  },
  {
    version: '1.3.0',
    title: 'Forms · overlays · Organize drag',
    date: '2026-08-07',
    items: [
      {
        kind: 'added',
        text: 'In-app auto-update — Update installs and relaunches without a manual redownload',
      },
      {
        kind: 'added',
        text: 'Dark / light theme toggle in the toolbar and Settings',
      },
      {
        kind: 'added',
        text: 'Drag page tiles in Organize to reorder (multi-select moves as a block)',
      },
      {
        kind: 'added',
        text: 'Add-mode overlays stay editable after save and reopen',
      },
      {
        kind: 'improved',
        text: 'Smart Fill: checkboxes, Express fields, tall notes, and date text',
      },
      {
        kind: 'improved',
        text: 'Inline edit for Add text / date / initials; image pick on place',
      },
      {
        kind: 'improved',
        text: 'Recent files menu and welcome screen polish',
      },
      {
        kind: 'improved',
        text: 'New PDFs open fit-to-page so the whole page is visible',
      },
    ],
  },
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
