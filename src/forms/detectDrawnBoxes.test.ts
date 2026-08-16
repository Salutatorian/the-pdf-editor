import { describe, expect, it } from 'vitest';
import {
  cellsFromLineGrid,
  clusterCoords,
  geometryFromPathBuffer,
  mostlyInside,
  pruneDrawnBoxes,
  rectsFromPathBuffer,
  type DrawnBox,
} from './detectDrawnBoxes.ts';
import { clipSuggestionsToNeighbors } from './SmartFill.ts';
import type { SmartFillSuggestion } from '../document/types.ts';

describe('rectsFromPathBuffer', () => {
  it('extracts an axis-aligned rectangle from a constructPath buffer', () => {
    const data = [
      0, 10, 20, 1, 30, 20, 1, 30, 40, 1, 10, 40, 4,
    ];
    const ctm: [number, number, number, number, number, number] = [
      1, 0, 0, 1, 0, 0,
    ];
    const pageHeight = 100;
    const rects = rectsFromPathBuffer(data, ctm, pageHeight);
    expect(rects).toHaveLength(1);
    expect(rects[0]!.width).toBeCloseTo(20);
    expect(rects[0]!.height).toBeCloseTo(20);
    expect(rects[0]!.y).toBeCloseTo(60);
    expect(rects[0]!.x).toBeCloseTo(10);
  });

  it('records line segments for grid detection', () => {
    const geo = geometryFromPathBuffer(
      [0, 0, 50, 1, 100, 50, 0, 40, 0, 1, 40, 80],
      [1, 0, 0, 1, 0, 0],
      200,
    );
    expect(geo.segments.length).toBeGreaterThanOrEqual(2);
  });
});

describe('cellsFromLineGrid', () => {
  it('builds a cell from a simple 4-line box', () => {
    const segments = [
      { x1: 10, y1: 10, x2: 110, y2: 10 },
      { x1: 10, y1: 40, x2: 110, y2: 40 },
      { x1: 10, y1: 10, x2: 10, y2: 40 },
      { x1: 110, y1: 10, x2: 110, y2: 40 },
    ];
    const cells = cellsFromLineGrid(segments, 612, 792);
    expect(cells.some((c) => c.width > 90 && c.height > 25)).toBe(true);
  });

  it('clusters nearby coordinates', () => {
    const c = clusterCoords([10, 10.5, 50, 50.2, 90]);
    expect(c).toHaveLength(3);
    expect(c[0]).toBeCloseTo(10.25, 1);
    expect(c[1]).toBeCloseTo(50.1, 1);
    expect(c[2]).toBe(90);
  });
});

describe('pruneDrawnBoxes', () => {
  it('drops parent frames that contain smaller cells', () => {
    const boxes: DrawnBox[] = [
      { x: 10, y: 10, width: 200, height: 60, kind: 'text' },
      { x: 20, y: 20, width: 80, height: 24, kind: 'text' },
      { x: 120, y: 20, width: 80, height: 24, kind: 'text' },
      { x: 30, y: 50, width: 14, height: 14, kind: 'checkbox' },
    ];
    const pruned = pruneDrawnBoxes(boxes);
    expect(pruned.some((b) => b.width === 200)).toBe(false);
    expect(pruned.filter((b) => b.kind === 'text')).toHaveLength(2);
    expect(pruned.some((b) => b.kind === 'checkbox')).toBe(true);
  });

  it('mostlyInside detects nested cells', () => {
    expect(
      mostlyInside(
        { x: 20, y: 20, width: 40, height: 20 },
        { x: 10, y: 10, width: 200, height: 100 },
      ),
    ).toBe(true);
  });
});

describe('clipSuggestionsToNeighbors', () => {
  it('shrinks a wide field so it does not cover the next cell', () => {
    const suggestions: SmartFillSuggestion[] = [
      {
        id: 'a',
        kind: 'text',
        pageIndex: 0,
        rect: { x: 10, y: 10, width: 200, height: 20 },
        confidence: 0.8,
        label: 'FROM',
        confirmed: false,
      },
      {
        id: 'b',
        kind: 'text',
        pageIndex: 0,
        rect: { x: 120, y: 10, width: 80, height: 20 },
        confidence: 0.8,
        label: 'TO',
        confirmed: false,
      },
    ];
    const clipped = clipSuggestionsToNeighbors(suggestions, 612);
    const from = clipped.find((s) => s.id === 'a')!;
    expect(from.rect.x + from.rect.width).toBeLessThanOrEqual(117);
  });
});
