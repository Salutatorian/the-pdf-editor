import { describe, expect, it } from 'vitest';
import {
  expandRectToContainingDrawnBox,
  fitFillRectInClosedBox,
  shrinkFieldAwayFromPrintedText,
} from './fitFieldAwayFromPrintedText.ts';
import type { FormField } from '../document/types.ts';

function textField(rect: FormField['rect']): FormField {
  return {
    id: '1',
    name: 'field',
    type: 'text',
    pageIndex: 0,
    rect,
    value: '',
  };
}

describe('fitFillRectInClosedBox', () => {
  it('fills full width below a top title (Name and Address of Employer)', () => {
    const cell = { x: 40, y: 200, width: 500, height: 80 };
    const fill = fitFillRectInClosedBox(cell, [
      {
        str: 'Name and Address of Employer',
        x: 45,
        y: 203,
        width: 200,
        height: 11,
      },
    ]);
    expect(fill.x).toBeLessThanOrEqual(45);
    expect(fill.width).toBeGreaterThanOrEqual(490);
    expect(fill.y).toBeGreaterThanOrEqual(214);
    expect(fill.y).toBeLessThanOrEqual(222);
    expect(fill.height).toBeGreaterThanOrEqual(54);
  });

  it('fills full height to the right of a left label (Description of Work)', () => {
    const cell = { x: 40, y: 300, width: 520, height: 36 };
    const fill = fitFillRectInClosedBox(cell, [
      {
        str: 'Description of Work',
        x: 44,
        y: 308,
        width: 110,
        height: 11,
      },
    ]);
    expect(fill.x).toBeGreaterThanOrEqual(154);
    expect(fill.x).toBeLessThanOrEqual(162);
    expect(fill.y).toBeLessThanOrEqual(304);
    expect(fill.width).toBeGreaterThanOrEqual(390);
    expect(fill.height).toBeGreaterThanOrEqual(28);
  });

  it('keeps fill below Dates of Employment title (not over FROM/TO header)', () => {
    // Ruled cell: title on top, FROM / TO under it — widget often sits on the title
    const cell = { x: 40, y: 400, width: 280, height: 52 };
    const fill = fitFillRectInClosedBox(cell, [
      {
        str: 'Dates of Employment (Month, Year)',
        x: 44,
        y: 403,
        width: 210,
        height: 11,
      },
      { str: 'FROM', x: 48, y: 422, width: 32, height: 9 },
      { str: 'TO', x: 160, y: 422, width: 16, height: 9 },
    ]);
    // Must clear the title line
    expect(fill.y).toBeGreaterThanOrEqual(416);
    // Must not cover the whole cell starting at the title
    expect(fill.y).toBeGreaterThan(cell.y + 10);
    expect(fill.width).toBeGreaterThanOrEqual(200);
    expect(fill.height).toBeGreaterThanOrEqual(14);
  });

  it('does not use left-of-FROM layout when a wide title sits on top', () => {
    const cell = { x: 40, y: 400, width: 280, height: 44 };
    const fill = fitFillRectInClosedBox(cell, [
      {
        str: 'Dates of Employment (Month, Year)',
        x: 44,
        y: 402,
        width: 210,
        height: 11,
      },
      { str: 'FROM', x: 48, y: 420, width: 32, height: 9 },
    ]);
    // Left layout would start near x~80 and still overlap the title vertically
    expect(fill.y).toBeGreaterThanOrEqual(415);
    expect(fill.x).toBeLessThanOrEqual(48);
  });
});

describe('expandRectToContainingDrawnBox', () => {
  it('expands a small widget to its ruled cell', () => {
    const widget = { x: 120, y: 220, width: 80, height: 20 };
    const expanded = expandRectToContainingDrawnBox(widget, [
      {
        kind: 'text',
        x: 40,
        y: 200,
        width: 500,
        height: 80,
      },
    ]);
    expect(expanded.width).toBe(500);
    expect(expanded.height).toBe(80);
    expect(expanded.x).toBe(40);
  });
});

describe('shrinkFieldAwayFromPrintedText', () => {
  it('expands then fills around a top title', () => {
    const field = textField({ x: 200, y: 230, width: 100, height: 18 });
    const next = shrinkFieldAwayFromPrintedText(
      field,
      [
        {
          str: 'Name and Address of Employer',
          x: 45,
          y: 203,
          width: 200,
          height: 11,
        },
      ],
      [{ kind: 'text', x: 40, y: 200, width: 500, height: 80 }],
    );
    expect(next.rect.width).toBeGreaterThanOrEqual(480);
    expect(next.rect.x).toBeLessThanOrEqual(45);
    expect(next.rect.y).toBeLessThanOrEqual(222);
  });
});
