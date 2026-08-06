import { describe, expect, it } from 'vitest';
import { detectSmartFillSuggestions } from './SmartFill.ts';

describe('detectSmartFillSuggestions', () => {
  it('marks all suggestions confirmed: false', () => {
    const suggestions = detectSmartFillSuggestions(612, 792, 0, [
      {
        str: 'Signature',
        transform: [1, 0, 0, 1, 72, 200],
        width: 60,
        height: 12,
      },
      {
        str: 'Date',
        transform: [1, 0, 0, 1, 72, 160],
        width: 30,
        height: 12,
      },
      {
        str: '________',
        transform: [1, 0, 0, 1, 72, 120],
        width: 180,
        height: 10,
      },
      {
        str: '☐',
        transform: [1, 0, 0, 1, 72, 80],
        width: 14,
        height: 14,
      },
    ]);

    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(s.confirmed).toBe(false);
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('returns unconfirmed weak suggestion when no text items', () => {
    const suggestions = detectSmartFillSuggestions(612, 792, 1);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.confirmed === false)).toBe(true);
  });
});
