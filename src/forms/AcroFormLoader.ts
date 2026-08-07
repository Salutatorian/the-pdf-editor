import { PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import type { FormField, FormFieldType } from '../document/types.ts';
import { normalizeFieldType } from './SmartFill.ts';

function lowerName(name: string): string {
  return name.toLowerCase();
}

function inferTypeFromName(name: string, base: FormFieldType): FormFieldType {
  const n = lowerName(name);
  if (
    /\b(signature|signer|sign[_ -]?here)\b/.test(n) ||
    /(^|[_.\s-])sign($|[_.\s-])/.test(n)
  ) {
    return 'signature';
  }
  if (
    /\b(date|dob|birthday)\b/.test(n) ||
    n.endsWith('_dt') ||
    n.endsWith('.date')
  ) {
    return 'date';
  }
  return base;
}

type WidgetLike = {
  getRectangle: () => { x: number; y: number; width: number; height: number };
  dict?: {
    lookupMaybe: (name: unknown, type: unknown) => unknown;
  };
};

type AcroFieldLike = {
  getWidgets: () => WidgetLike[];
};

function getWidgets(field: unknown): WidgetLike[] {
  if (typeof field !== 'object' || field === null) return [];
  const withAcro = field as { acroField?: AcroFieldLike };
  if (!withAcro.acroField || typeof withAcro.acroField.getWidgets !== 'function') {
    return [];
  }
  try {
    return withAcro.acroField.getWidgets();
  } catch {
    return [];
  }
}

function pageIndexForWidget(
  pages: ReturnType<PDFDocument['getPages']>,
  widget: WidgetLike,
  fallbackY: number,
): number {
  try {
    const pageRef = widget.dict?.lookupMaybe?.(PDFName.of('P'), PDFRef);
    if (pageRef) {
      const idx = pages.findIndex((p) => p.ref === pageRef);
      if (idx >= 0) return idx;
    }
  } catch {
    // fall through
  }

  // Fallback: first page whose height contains the widget bottom-left Y
  for (let i = 0; i < pages.length; i++) {
    const ph = pages[i]!.getHeight();
    if (fallbackY >= -2 && fallbackY <= ph + 2) return i;
  }
  return 0;
}

function widgetToTopLeftRect(
  page: ReturnType<PDFDocument['getPages']>[number],
  wr: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  // Match pdf.js view: CropBox is the visible page (MediaBox can be offset)
  const box =
    typeof page.getCropBox === 'function' ? page.getCropBox() : page.getMediaBox();
  return {
    x: wr.x - box.x,
    y: box.y + box.height - wr.y - wr.height,
    width: Math.max(4, wr.width),
    height: Math.max(4, wr.height),
  };
}

/**
 * Load AcroForm fields from PDF bytes into app `FormField` models.
 * Emits one FormField per widget (radio/checkbox groups included).
 */
export async function loadAcroFormFields(
  pdfBytes: Uint8Array,
): Promise<FormField[]> {
  // Defensive copy — callers may pass buffers pdf.js later mutates
  const data = pdfBytes.slice();
  const pdfDoc = await PDFDocument.load(data, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  let form;
  try {
    form = pdfDoc.getForm();
  } catch {
    return [];
  }

  const pages = pdfDoc.getPages();
  const results: FormField[] = [];

  for (const field of form.getFields()) {
    const name = field.getName();
    const ctor = field.constructor.name;
    let type: FormFieldType = 'text';
    let value = '';
    let options: string[] | undefined;
    let readOnly = false;
    let groupName: string | undefined;

    try {
      if (ctor === 'PDFTextField') {
        const textField = form.getTextField(name);
        value = textField.getText() ?? '';
        type = inferTypeFromName(name, 'text');
        readOnly = textField.isReadOnly();
      } else if (ctor === 'PDFCheckBox') {
        const checkBox = form.getCheckBox(name);
        type = 'checkbox';
        value = checkBox.isChecked() ? 'true' : 'false';
        readOnly = checkBox.isReadOnly();
      } else if (ctor === 'PDFRadioGroup') {
        const radio = form.getRadioGroup(name);
        type = 'radio';
        options = radio.getOptions();
        value = radio.getSelected() ?? '';
        groupName = name;
        readOnly = radio.isReadOnly();
      } else if (ctor === 'PDFDropdown') {
        const dropdown = form.getDropdown(name);
        type = 'dropdown';
        options = dropdown.getOptions();
        const selected = dropdown.getSelected();
        value = selected[0] ?? '';
        readOnly = dropdown.isReadOnly();
      } else if (ctor === 'PDFOptionList') {
        const list = form.getOptionList(name);
        type = 'dropdown';
        options = list.getOptions();
        const selected = list.getSelected();
        value = selected[0] ?? '';
        readOnly = list.isReadOnly();
      } else if (ctor === 'PDFSignature') {
        type = 'signature';
        value = '';
      } else {
        type = inferTypeFromName(name, 'text');
      }
    } catch {
      type = inferTypeFromName(name, 'text');
    }

    const widgets = getWidgets(field);
    if (widgets.length === 0) {
      results.push({
        id: uuidv4(),
        name,
        type,
        pageIndex: 0,
        rect: { x: 0, y: 0, width: 100, height: 20 },
        value,
        options,
        readOnly,
        groupName,
        placeholder: name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(),
      });
      continue;
    }

    widgets.forEach((widget, widgetIndex) => {
      try {
        const wr = widget.getRectangle();
        const pageIndex = pageIndexForWidget(pages, widget, wr.y);
        const page = pages[pageIndex] ?? pages[0]!;
        const rect = widgetToTopLeftRect(page, wr);
        // Keep real widget size — printed checkbox/line is the guide; don't shrink
        const placeholder = /^text\d+$/i.test(name)
          ? ''
          : name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

        results.push({
          id: uuidv4(),
          name: widgets.length > 1 ? `${name}#${widgetIndex}` : name,
          type,
          pageIndex,
          rect,
          value,
          options,
          readOnly,
          groupName: groupName ?? (widgets.length > 1 ? name : undefined),
          placeholder,
        });
      } catch {
        // skip broken widget
      }
    });
  }

  return results.map(normalizeFieldType);
}
