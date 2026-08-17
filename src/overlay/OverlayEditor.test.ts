import { describe, expect, it } from 'vitest';
import { isBlankOverlayText } from './OverlayEditor.tsx';

describe('isBlankOverlayText', () => {
  it('treats empty and whitespace as discardable', () => {
    expect(isBlankOverlayText(undefined)).toBe(true);
    expect(isBlankOverlayText('')).toBe(true);
    expect(isBlankOverlayText('   ')).toBe(true);
    expect(isBlankOverlayText('\n\t')).toBe(true);
  });

  it('keeps boxes that have real text', () => {
    expect(isBlankOverlayText('n/a')).toBe(false);
    expect(isBlankOverlayText(' Saipan ')).toBe(false);
  });
});
