import { describe, expect, it } from 'vitest';
import {
  detectSmartFillSuggestions,
  filterSuggestionsAgainstFields,
  normalizeFieldType,
  placeholderFromLabel,
  suggestionToFormField,
} from './SmartFill.ts';

describe('detectSmartFillSuggestions', () => {
  it('marks all suggestions confirmed: false', () => {
    const suggestions = detectSmartFillSuggestions(612, 792, 0, [
      {
        str: 'Signature:',
        transform: [1, 0, 0, 1, 72, 200],
        width: 60,
        height: 12,
      },
      {
        str: '____________',
        transform: [1, 0, 0, 1, 140, 200],
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

  it('returns empty when no text items (no fake weak box)', () => {
    const suggestions = detectSmartFillSuggestions(612, 792, 1);
    expect(suggestions).toEqual([]);
  });

  it('does not invent fillables for labels without blank/underline lines', () => {
    const suggestions = detectSmartFillSuggestions(612, 792, 0, [
      {
        str: 'Note:',
        transform: [1, 0, 0, 1, 72, 100],
        width: 30,
        height: 12,
      },
      {
        str: 'This declaration should be reviewed by Attorney King.',
        transform: [1, 0, 0, 1, 110, 100],
        width: 300,
        height: 12,
      },
      {
        str: 'Relationship to Emmanuel:',
        transform: [1, 0, 0, 1, 72, 200],
        width: 140,
        height: 12,
      },
      {
        str: 'Nephew',
        transform: [1, 0, 0, 1, 220, 200],
        width: 50,
        height: 12,
      },
      {
        str: 'Date:',
        transform: [1, 0, 0, 1, 72, 160],
        width: 30,
        height: 12,
      },
      {
        str: 'August 7, 2026',
        transform: [1, 0, 0, 1, 110, 160],
        width: 90,
        height: 12,
      },
      {
        str: 'Signature:',
        transform: [1, 0, 0, 1, 72, 240],
        width: 60,
        height: 12,
      },
    ]);
    expect(suggestions.filter((s) => s.kind !== 'checkbox')).toEqual([]);
  });

  it('detects labeled Name/Address lines only when blank lines exist', () => {
    const suggestions = detectSmartFillSuggestions(612, 792, 0, [
      {
        str: 'Name:',
        transform: [1, 0, 0, 1, 72, 700],
        width: 40,
        height: 12,
      },
      {
        str: '________________',
        transform: [1, 0, 0, 1, 120, 700],
        width: 200,
        height: 10,
      },
      {
        str: 'Address:',
        transform: [1, 0, 0, 1, 72, 670],
        width: 55,
        height: 12,
      },
      {
        str: '________________',
        transform: [1, 0, 0, 1, 135, 670],
        width: 220,
        height: 10,
      },
      {
        str: 'OCEAN',
        transform: [1, 0, 0, 1, 200, 400],
        width: 50,
        height: 12,
      },
      {
        str: 'AIR',
        transform: [1, 0, 0, 1, 200, 380],
        width: 30,
        height: 12,
      },
    ]);

    const labels = suggestions.map((s) => (s.label ?? '').toLowerCase());
    expect(labels.some((l) => l.includes('name'))).toBe(true);
    expect(labels.some((l) => l.includes('address'))).toBe(true);
    expect(
      suggestions.some(
        (s) =>
          s.kind === 'checkbox' &&
          (s.label?.toLowerCase() === 'ocean' ||
            s.label?.toLowerCase() === 'air'),
      ),
    ).toBe(true);
  });

  it('does not treat SHIPPER/CONSIGNEE section headers as fill lines', () => {
    const suggestions = detectSmartFillSuggestions(612, 792, 0, [
      {
        str: 'SHIPPER:',
        transform: [1, 0, 0, 1, 40, 720],
        width: 70,
        height: 14,
      },
      {
        str: 'CONSIGNEE:',
        transform: [1, 0, 0, 1, 40, 500],
        width: 90,
        height: 14,
      },
      {
        str: 'Name:',
        transform: [1, 0, 0, 1, 40, 700],
        width: 40,
        height: 12,
      },
      {
        str: '____________',
        transform: [1, 0, 0, 1, 90, 700],
        width: 160,
        height: 10,
      },
    ]);
    expect(
      suggestions.every(
        (s) => !/^shipper/i.test(s.label ?? '') && !/^consignee/i.test(s.label ?? ''),
      ),
    ).toBe(true);
    expect(suggestions.some((s) => /name/i.test(s.label ?? ''))).toBe(true);
  });

  it('detects prepaid / collect / pick-up shipping checkboxes', () => {
    const suggestions = detectSmartFillSuggestions(612, 792, 0, [
      {
        str: 'PAID AT ORIGIN BY SHIPPER (PREPAID)',
        transform: [1, 0, 0, 1, 80, 400],
        width: 220,
        height: 12,
      },
      {
        str: 'PAID AT DESTINATION BY CONSIGNEE (COLLECT)',
        transform: [1, 0, 0, 1, 80, 380],
        width: 260,
        height: 12,
      },
      {
        str: 'PLEASE PICK UP',
        transform: [1, 0, 0, 1, 80, 300],
        width: 100,
        height: 12,
      },
      {
        str: 'WILL DROP OFF',
        transform: [1, 0, 0, 1, 80, 280],
        width: 90,
        height: 12,
      },
    ]);
    const checks = suggestions.filter((s) => s.kind === 'checkbox');
    expect(checks.length).toBeGreaterThanOrEqual(4);
    expect(
      checks.some((s) => /prepaid|paid at origin/i.test(s.label ?? '')),
    ).toBe(true);
  });

  it('skips suggestions that overlap existing AcroForm fields', () => {
    const suggestions = detectSmartFillSuggestions(612, 792, 0, [
      {
        str: 'Name:',
        transform: [1, 0, 0, 1, 72, 700],
        width: 40,
        height: 12,
      },
      {
        str: '____________',
        transform: [1, 0, 0, 1, 120, 700],
        width: 180,
        height: 10,
      },
    ]);
    expect(suggestions.length).toBeGreaterThan(0);
    const first = suggestions[0]!;
    const filtered = filterSuggestionsAgainstFields(suggestions, [
      {
        id: 'existing',
        name: 'name',
        type: 'text',
        pageIndex: 0,
        rect: { ...first.rect },
        value: '',
      },
    ]);
    expect(filtered).toHaveLength(0);
  });

  it('dedupes stacked fields on the same row', async () => {
    const { dedupeFormFields } = await import('./SmartFill.ts');
    const fields = [
      {
        id: 'a',
        name: 'a',
        type: 'text' as const,
        pageIndex: 0,
        rect: { x: 100, y: 200, width: 200, height: 22 },
        value: '',
        synthetic: true,
      },
      {
        id: 'b',
        name: 'b',
        type: 'text' as const,
        pageIndex: 0,
        rect: { x: 110, y: 202, width: 180, height: 22 },
        value: '',
        synthetic: true,
      },
      {
        id: 'c',
        name: 'c',
        type: 'checkbox' as const,
        pageIndex: 0,
        rect: { x: 50, y: 300, width: 14, height: 14 },
        value: 'false',
        synthetic: true,
      },
      {
        id: 'd',
        name: 'd',
        type: 'checkbox' as const,
        pageIndex: 0,
        rect: { x: 52, y: 301, width: 14, height: 14 },
        value: 'false',
        synthetic: true,
      },
    ];
    const out = dedupeFormFields(fields);
    expect(out).toHaveLength(2);
  });

  it('drops TextN ghosts that sit on named table cells', async () => {
    const { dedupeFormFields } = await import('./SmartFill.ts');
    const fields = [
      {
        id: 'named',
        name: 'Marks Nos3',
        type: 'text' as const,
        pageIndex: 0,
        rect: { x: 40, y: 200, width: 80, height: 18 },
        value: '',
      },
      {
        id: 'ghost',
        name: 'Text20',
        type: 'text' as const,
        pageIndex: 0,
        rect: { x: 42, y: 205, width: 76, height: 16 },
        value: '',
        placeholder: 'Text20',
      },
      {
        id: 'pkgs',
        name: 'No pkgs3',
        type: 'text' as const,
        pageIndex: 0,
        rect: { x: 130, y: 200, width: 60, height: 18 },
        value: '',
      },
    ];
    const out = dedupeFormFields(fields);
    expect(out.map((f) => f.name)).toEqual(['Marks Nos3', 'No pkgs3']);
  });

  it('builds grey placeholder from label', () => {
    expect(placeholderFromLabel('Name:', 'text')).toBe('Name');
    const field = suggestionToFormField({
      id: 'x',
      kind: 'text',
      pageIndex: 0,
      rect: { x: 0, y: 0, width: 100, height: 20 },
      confidence: 1,
      label: 'Address:',
      confirmed: false,
    });
    expect(field.placeholder).toBe('Address');
    expect(field.type).toBe('text');
  });

  it('detects Express shipping option as a checkbox', () => {
    const suggestions = detectSmartFillSuggestions(612, 792, 0, [
      {
        str: 'Ocean',
        transform: [1, 0, 0, 1, 100, 400],
        width: 40,
        height: 12,
      },
      {
        str: 'Air',
        transform: [1, 0, 0, 1, 180, 400],
        width: 24,
        height: 12,
      },
      {
        str: 'Ground',
        transform: [1, 0, 0, 1, 240, 400],
        width: 48,
        height: 12,
      },
      {
        str: 'Express',
        transform: [1, 0, 0, 1, 320, 400],
        width: 50,
        height: 12,
      },
    ]);
    const checks = suggestions.filter((s) => s.kind === 'checkbox');
    expect(checks.length).toBe(4);
    expect(checks.some((s) => /express/i.test(s.label ?? ''))).toBe(true);
  });

  it('prefers checkbox over overlapping text suggestion', () => {
    const suggestions = detectSmartFillSuggestions(612, 792, 0, [
      {
        str: 'Shipping preference:',
        transform: [1, 0, 0, 1, 40, 420],
        width: 120,
        height: 12,
      },
      {
        str: '____________',
        transform: [1, 0, 0, 1, 80, 400],
        width: 14,
        height: 12,
      },
      {
        str: 'Ocean',
        transform: [1, 0, 0, 1, 100, 400],
        width: 40,
        height: 12,
      },
    ]);
    expect(suggestions.some((s) => s.kind === 'checkbox')).toBe(true);
    // Tiny blank under the option must not become a type-in field
    expect(
      suggestions.every(
        (s) =>
          !(
            s.kind === 'text' &&
            s.rect.width <= 26 &&
            s.rect.height <= 26
          ),
      ),
    ).toBe(true);
  });

  it('promotes tiny square text widgets to checkboxes', () => {
    const field = normalizeFieldType({
      id: '1',
      name: 'preference',
      type: 'text',
      pageIndex: 0,
      rect: { x: 10, y: 10, width: 14, height: 14 },
      value: 'pre',
      placeholder: 'preference',
    });
    expect(field.type).toBe('checkbox');
    expect(field.value).toBe('false');
    expect(field.placeholder).toBe('');
  });
});
