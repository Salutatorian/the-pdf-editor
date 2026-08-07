import { describe, expect, it } from 'vitest';
import { isAllowedUpdateUrl, isNewerVersion } from './updateService.ts';
import {
  loadAppSettings,
  patchAppSettings,
  saveAppSettings,
} from './appSettings.ts';

describe('isNewerVersion', () => {
  it('detects remote newer than local', () => {
    expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false);
  });

  it('handles v-prefix tags', () => {
    expect(isNewerVersion('v0.3.0', '0.2.1')).toBe(true);
  });
});

describe('isAllowedUpdateUrl', () => {
  it('allows only this repo on github https', () => {
    expect(
      isAllowedUpdateUrl(
        'https://github.com/Salutatorian/the-pdf-editor/releases/tag/v0.2.0',
      ),
    ).toBe(true);
    expect(
      isAllowedUpdateUrl('https://github.com/Salutatorian/the-pdf-editor'),
    ).toBe(true);
    expect(isAllowedUpdateUrl('https://evil.com/Salutatorian/the-pdf-editor')).toBe(
      false,
    );
    expect(
      isAllowedUpdateUrl('https://github.com/other/repo/releases'),
    ).toBe(false);
    expect(
      isAllowedUpdateUrl('http://github.com/Salutatorian/the-pdf-editor'),
    ).toBe(false);
  });
});

describe('appSettings', () => {
  it('defaults open-at-login to off', () => {
    localStorage.clear();
    const s = loadAppSettings();
    expect(s.openAtLogin).toBe(false);
    expect(s.lastSeenChangelogVersion).toBeNull();
  });

  it('persists changelog dismissal', () => {
    localStorage.clear();
    saveAppSettings({
      openAtLogin: false,
      lastLaunchedVersion: '0.1.0',
      lastSeenChangelogVersion: null,
      dismissedUpdateVersion: null,
    });
    patchAppSettings({ lastSeenChangelogVersion: '0.1.0' });
    expect(loadAppSettings().lastSeenChangelogVersion).toBe('0.1.0');
  });
});
