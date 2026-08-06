import { PDFDocument } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import type { FormField, FormFieldType } from '../document/types.ts';

function lowerName(name: string): string {
  return name.toLowerCase();
}

function inferTypeFromName(name: string, base: FormFieldType): FormFieldType {
  const n = lowerName(name);
  if (n.includes('sign')) return 'signature';
  if (
    n.includes('date') ||
    n.includes('dob') ||
    n.includes('birthday') ||
    n.endsWith('_dt')
  ) {
    return 'date';
  }
  return base;
}

type WidgetLike = {
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

/**
 * Load AcroForm fields from PDF bytes into app `FormField` models.
 */
export async function loadAcroFormFields(
  pdfBytes: Uint8Array,
): Promise<FormField[]> {
  const pdfDoc = await PDFDocument.load(pdfBytes, {
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
  const defaultPageHeight = pages[0]?.getHeight() ?? 792;
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

    let rect = { x: 0, y: 0, width: 100, height: 20 };
    let pageIndex = 0;
    const widgets = getWidgets(field);
    const widget = widgets[0];
    if (widget) {
      try {
        const wr = widget.getRectangle();
        // Prefer matching page by vertical bounds
        let pageHeight = defaultPageHeight;
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i]!;
          const ph = page.getHeight();
          if (wr.y >= -1 && wr.y + wr.height <= ph + 1) {
            pageIndex = i;
            pageHeight = ph;
            break;
          }
        }
        rect = {
          x: wr.x,
          y: pageHeight - wr.y - wr.height,
          width: wr.width,
          height: wr.height,
        };
      } catch {
        // keep defaults
      }
    }

    results.push({
      id: uuidv4(),
      name,
      type,
      pageIndex,
      rect,
      value,
      options,
      readOnly,
      groupName,
    });
  }

  return results;
}
