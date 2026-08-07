import { describe, expect, it } from 'vitest';

/**
 * Mirror of syncFormFieldRectsFromPdfJs viewportRect using only
 * convertToViewportPoint (pdf.js v5+ API).
 */
function viewportRect(
  convertToViewportPoint: (x: number, y: number) => number[],
  pdfRect: number[],
) {
  const x1 = pdfRect[0] ?? 0;
  const y1 = pdfRect[1] ?? 0;
  const x2 = pdfRect[2] ?? x1;
  const y2 = pdfRect[3] ?? y1;
  const [vx1, vy1] = convertToViewportPoint(x1, y1);
  const [vx2, vy2] = convertToViewportPoint(x2, y2);
  return {
    x: Math.min(vx1 ?? 0, vx2 ?? 0),
    y: Math.min(vy1 ?? 0, vy2 ?? 0),
    width: Math.max(4, Math.abs((vx2 ?? 0) - (vx1 ?? 0))),
    height: Math.max(4, Math.abs((vy2 ?? 0) - (vy1 ?? 0))),
  };
}

describe('pdf.js viewport rect mapping', () => {
  it('maps PDF rect corners via convertToViewportPoint', () => {
    // Simulate flipped Y (common PDF → canvas)
    const convert = (x: number, y: number) => [x, 792 - y];
    const rect = viewportRect(convert, [100, 700, 300, 720]);
    expect(rect.x).toBe(100);
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(20);
    expect(rect.y).toBe(72);
  });
});
