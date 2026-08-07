import { describe, expect, it } from 'vitest';
import { formatOpenedAt } from './formatOpenedAt.ts';

describe('formatOpenedAt', () => {
  const now = Date.parse('2026-08-06T05:00:00.000Z');

  it('formats recent times', () => {
    expect(formatOpenedAt(now - 10_000, now)).toBe('Just now');
    expect(formatOpenedAt(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatOpenedAt(now - 3 * 3600_000, now)).toBe('3h ago');
    expect(formatOpenedAt(now - 2 * 86400_000, now)).toBe('2d ago');
  });
});
