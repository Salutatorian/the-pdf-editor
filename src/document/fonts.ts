/**
 * Font choices for the Add Text tool.
 *
 * On-screen (Konva / textarea) the CSS family is used directly, so any font
 * installed on the machine renders natively. Saved PDFs can only carry the
 * 14 standard PDF fonts without embedding font files, so each entry maps to
 * a base family (sans → Helvetica, serif → Times, mono → Courier).
 */

export type PdfBaseFont = 'sans' | 'serif' | 'mono';

export type TextFontOption = {
  /** Shown in the dropdown */
  label: string;
  /** CSS font-family stack used on screen */
  cssFamily: string;
  pdfBase: PdfBaseFont;
};

export const DEFAULT_TEXT_FONT = 'IBM Plex Sans';

export const TEXT_FONT_OPTIONS: TextFontOption[] = [
  { label: 'IBM Plex Sans', cssFamily: DEFAULT_TEXT_FONT, pdfBase: 'sans' },
  { label: 'Arial', cssFamily: 'Arial, Helvetica, sans-serif', pdfBase: 'sans' },
  { label: 'Helvetica', cssFamily: 'Helvetica, Arial, sans-serif', pdfBase: 'sans' },
  { label: 'Calibri', cssFamily: 'Calibri, Carlito, sans-serif', pdfBase: 'sans' },
  { label: 'Segoe UI', cssFamily: '"Segoe UI", system-ui, sans-serif', pdfBase: 'sans' },
  { label: 'Verdana', cssFamily: 'Verdana, Geneva, sans-serif', pdfBase: 'sans' },
  { label: 'Tahoma', cssFamily: 'Tahoma, Geneva, sans-serif', pdfBase: 'sans' },
  { label: 'Trebuchet MS', cssFamily: '"Trebuchet MS", sans-serif', pdfBase: 'sans' },
  { label: 'Comic Sans MS', cssFamily: '"Comic Sans MS", cursive', pdfBase: 'sans' },
  { label: 'Impact', cssFamily: 'Impact, sans-serif', pdfBase: 'sans' },
  { label: 'Times New Roman', cssFamily: '"Times New Roman", Times, serif', pdfBase: 'serif' },
  { label: 'Georgia', cssFamily: 'Georgia, serif', pdfBase: 'serif' },
  { label: 'Cambria', cssFamily: 'Cambria, Georgia, serif', pdfBase: 'serif' },
  { label: 'Garamond', cssFamily: 'Garamond, "EB Garamond", serif', pdfBase: 'serif' },
  { label: 'Courier New', cssFamily: '"Courier New", Courier, monospace', pdfBase: 'mono' },
  { label: 'Consolas', cssFamily: 'Consolas, "Courier New", monospace', pdfBase: 'mono' },
];

/**
 * Resolve a stored fontFamily (a CSS stack or legacy single name) to the
 * standard-PDF base family used when baking text into the file.
 */
export function pdfBaseForFamily(fontFamily: string | undefined): PdfBaseFont {
  if (!fontFamily) return 'sans';
  const lower = fontFamily.toLowerCase();
  if (lower.includes('mono') || lower.includes('courier') || lower.includes('consolas')) {
    return 'mono';
  }
  if (
    lower.includes('serif') ||
    lower.includes('times') ||
    lower.includes('georgia') ||
    lower.includes('cambria') ||
    lower.includes('garamond')
  ) {
    return 'serif';
  }
  return 'sans';
}
