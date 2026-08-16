import { describe, expect, it } from 'vitest';
import { allowShortcutWhileEditing } from './shortcuts.ts';

describe('allowShortcutWhileEditing', () => {
  it('blocks overlay edit chords so Fill fields keep native Ctrl+A / undo', () => {
    expect(allowShortcutWhileEditing('selectAll')).toBe(false);
    expect(allowShortcutWhileEditing('undo')).toBe(false);
    expect(allowShortcutWhileEditing('redo')).toBe(false);
    expect(allowShortcutWhileEditing('duplicate')).toBe(false);
    expect(allowShortcutWhileEditing('delete')).toBe(false);
    expect(allowShortcutWhileEditing('nudgeLeft')).toBe(false);
    expect(allowShortcutWhileEditing('search')).toBe(false);
  });

  it('still allows save / zoom / mode switches while typing', () => {
    expect(allowShortcutWhileEditing('save')).toBe(true);
    expect(allowShortcutWhileEditing('saveAs')).toBe(true);
    expect(allowShortcutWhileEditing('open')).toBe(true);
    expect(allowShortcutWhileEditing('zoomIn')).toBe(true);
    expect(allowShortcutWhileEditing('modeFill')).toBe(true);
    expect(allowShortcutWhileEditing('showShortcuts')).toBe(true);
  });
});
