import { describe, expect, it } from 'vitest';
import {
  assertSafePdfBytes,
  isSafePdfPath,
  isSafeSignatureDataUrl,
  MAX_PDF_BYTES,
} from './pdfSafety.ts';

describe('pdfSafety', () => {
  it('accepts normal PDF paths', () => {
    expect(isSafePdfPath('C:\\Users\\me\\Docs\\a.pdf')).toBe(true);
    expect(isSafePdfPath('/home/me/a.PDF')).toBe(true);
  });

  it('rejects schemes and non-pdf', () => {
    expect(isSafePdfPath('https://evil.com/a.pdf')).toBe(false);
    expect(isSafePdfPath('javascript:alert(1)')).toBe(false);
    expect(isSafePdfPath('notes.txt')).toBe(false);
    expect(isSafePdfPath('a.pdf\0.exe')).toBe(false);
  });

  it('checks PDF magic and size', () => {
    const ok = new TextEncoder().encode('%PDF-1.7\n%%EOF');
    expect(() => assertSafePdfBytes(ok)).not.toThrow();

    expect(() => assertSafePdfBytes(new Uint8Array([1, 2, 3]))).toThrow(
      /empty|unreadable/i,
    );
    expect(() => assertSafePdfBytes(new TextEncoder().encode('not-a-pdf!!!!'))).toThrow(
      /does not look like a PDF/i,
    );

    const huge = new Uint8Array(MAX_PDF_BYTES + 1);
    huge[0] = 0x25;
    huge[1] = 0x50;
    huge[2] = 0x44;
    huge[3] = 0x46;
    expect(() => assertSafePdfBytes(huge)).toThrow(/too large/i);
  });

  it('allows only image data URLs for signatures', () => {
    expect(isSafeSignatureDataUrl('data:image/png;base64,aaa')).toBe(true);
    expect(isSafeSignatureDataUrl('data:image/jpeg;base64,aaa')).toBe(true);
    expect(isSafeSignatureDataUrl('https://evil/x.png')).toBe(false);
    expect(isSafeSignatureDataUrl('data:text/html;base64,aaa')).toBe(false);
  });
});
