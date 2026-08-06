import { describe, expect, it } from 'vitest';
import {
  formatFileSize,
  hasEofMarker,
  isNonEmptyPdf,
  verifyPdfStructure,
} from './verifyPdf.ts';

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('isNonEmptyPdf', () => {
  it('rejects empty bytes', () => {
    expect(isNonEmptyPdf(new Uint8Array(0))).toBe(false);
  });

  it('rejects non-PDF header', () => {
    expect(isNonEmptyPdf(encode('not a pdf'))).toBe(false);
  });

  it('accepts valid %PDF header with content', () => {
    expect(isNonEmptyPdf(encode('%PDF-1.4\n…'))).toBe(true);
  });
});

describe('hasEofMarker', () => {
  it('detects %%EOF', () => {
    expect(hasEofMarker(encode('%PDF-1.4\n1 0 obj\n%%EOF\n'))).toBe(true);
  });

  it('reports missing %%EOF', () => {
    expect(hasEofMarker(encode('%PDF-1.4\ntruncated'))).toBe(false);
  });
});

describe('verifyPdfStructure', () => {
  it('fails on empty', () => {
    const result = verifyPdfStructure(new Uint8Array(0));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/empty/i);
    }
  });

  it('fails on missing header', () => {
    const result = verifyPdfStructure(encode('hello%%EOF'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/%PDF/);
    }
  });

  it('fails on missing EOF', () => {
    const result = verifyPdfStructure(encode('%PDF-1.7\ntrailer'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/EOF/);
    }
  });

  it('passes minimal valid structure', () => {
    const result = verifyPdfStructure(encode('%PDF-1.4\n%%EOF\n'));
    expect(result).toEqual({ ok: true });
  });
});

describe('formatFileSize', () => {
  it('formats bytes and kilobytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(2048)).toBe('2 KB');
  });
});
