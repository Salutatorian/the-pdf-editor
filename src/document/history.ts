import type { FormField, HistoryEntry, OverlayObject } from './types.ts';

export type HistoryState = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
};

export function createSnapshot(
  overlays: OverlayObject[],
  formFields: FormField[],
): HistoryEntry {
  const formValues: Record<string, string> = {};
  for (const field of formFields) {
    formValues[field.id] = field.value;
  }
  return {
    overlays: structuredClone(overlays),
    formValues,
  };
}

export function applySnapshot(
  snapshot: HistoryEntry,
  formFields: FormField[],
): { overlays: OverlayObject[]; formFields: FormField[] } {
  const overlays = structuredClone(snapshot.overlays);
  const nextFields = formFields.map((field) => {
    if (Object.prototype.hasOwnProperty.call(snapshot.formValues, field.id)) {
      return { ...field, value: snapshot.formValues[field.id]! };
    }
    return field;
  });
  return { overlays, formFields: nextFields };
}

export function canUndo(state: HistoryState): boolean {
  return state.undoStack.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.redoStack.length > 0;
}
