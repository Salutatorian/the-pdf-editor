import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRef,
} from 'pdf-lib';
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

/** AcroForm field names must never appear as gray ghost text on the page. */
export function acroFormPlaceholder(
  _name: string,
  _type: FormFieldType,
): string {
  return '';
}

type WidgetLike = {
  ref?: PDFRef;
  dict?: PDFDict;
  getRectangle: () => { x: number; y: number; width: number; height: number };
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

function pageIndexFromPRef(
  pages: ReturnType<PDFDocument['getPages']>,
  widget: WidgetLike,
): number | null {
  try {
    const pageRef = widget.dict?.lookupMaybe?.(PDFName.of('P'), PDFRef);
    if (pageRef) {
      const idx = pages.findIndex((p) => p.ref === pageRef);
      if (idx >= 0) return idx;
    }
  } catch {
    // fall through
  }
  return null;
}

function resolveWidgetRef(
  pdfDoc: PDFDocument,
  widget: WidgetLike,
): PDFRef | null {
  if (widget.ref instanceof PDFRef) return widget.ref;
  if (widget.dict) {
    try {
      const found = pdfDoc.context.getObjectRef(widget.dict);
      if (found instanceof PDFRef) return found;
    } catch {
      // fall through
    }
  }
  return null;
}

/** Find which page's /Annots array references this widget (correct page for orphan widgets). */
function pageIndexFromAnnots(
  pages: ReturnType<PDFDocument['getPages']>,
  target: PDFRef,
): number | null {
  for (let i = 0; i < pages.length; i++) {
    try {
      const annots = pages[i]!.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      if (!annots) continue;
      for (let j = 0; j < annots.size(); j++) {
        const entry = annots.get(j);
        if (entry === target) return i;
        if (
          entry instanceof PDFRef &&
          entry.objectNumber === target.objectNumber &&
          entry.generationNumber === target.generationNumber
        ) {
          return i;
        }
      }
    } catch {
      // keep searching
    }
  }
  return null;
}

function pageIndexForWidget(
  pdfDoc: PDFDocument,
  pages: ReturnType<PDFDocument['getPages']>,
  widget: WidgetLike,
): number | null {
  const fromP = pageIndexFromPRef(pages, widget);
  if (fromP !== null) return fromP;
  const ref = resolveWidgetRef(pdfDoc, widget);
  if (!ref) return null;
  return pageIndexFromAnnots(pages, ref);
}

function widgetToTopLeftRect(
  page: ReturnType<PDFDocument['getPages']>[number],
  wr: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
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
 * Widgets whose page cannot be resolved are skipped (never dumped onto page 1).
 */
export async function loadAcroFormFields(
  pdfBytes: Uint8Array,
): Promise<FormField[]> {
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
      // No drawable widget — skip (used to invent a fake page-1 box)
      continue;
    }

    widgets.forEach((widget, widgetIndex) => {
      try {
        const wr = widget.getRectangle();
        const pageIndex = pageIndexForWidget(pdfDoc, pages, widget);
        if (pageIndex === null) {
          // Do NOT fall back to page 0 — that painted every field on page 1
          return;
        }
        const page = pages[pageIndex];
        if (!page) return;
        const rect = widgetToTopLeftRect(page, wr);

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
          placeholder: acroFormPlaceholder(name, type),
        });
      } catch {
        // skip broken widget
      }
    });
  }

  return results.map(normalizeFieldType);
}
