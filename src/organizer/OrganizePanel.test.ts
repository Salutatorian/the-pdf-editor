import { describe, expect, it } from 'vitest';
import { orderAfterDrag } from './OrganizePanel.tsx';

describe('orderAfterDrag', () => {
  it('moves a single page earlier', () => {
    // [0,1,2,3] drag 3 onto 1 → [0,3,1,2]
    expect(orderAfterDrag(4, 3, 1)).toEqual([0, 3, 1, 2]);
  });

  it('moves a single page later', () => {
    // [0,1,2,3] drag 0 onto 2 → insert before 2 → [1,0,2,3]
    expect(orderAfterDrag(4, 0, 2)).toEqual([1, 0, 2, 3]);
  });

  it('moves a selected block together', () => {
    // move [1,2] onto 0 → [1,2,0,3]
    expect(orderAfterDrag(4, 1, 0, [1, 2])).toEqual([1, 2, 0, 3]);
  });

  it('returns null when dropping on itself', () => {
    expect(orderAfterDrag(3, 1, 1)).toBeNull();
  });
});
