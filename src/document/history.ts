import type { FormField, HistoryEntry, OverlayObject } from './types.ts';

export type HistoryState = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
};

/**
 * Deep-clone plain app data. Prefer JSON over structuredClone because undo
 * stacks live inside Immer state and may be Proxies (structuredClone throws).
 */
export function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createSnapshot(
  overlays: OverlayObject[],
  formFields: FormField[],
): HistoryEntry {
  const formValues: Record<string, string> = {};
  for (const field of formFields) {
    formValues[field.id] = field.value;
  }
  return {
    overlays: cloneData(overlays),
    formValues,
  };
}

export function applySnapshot(
  snapshot: HistoryEntry,
  formFields: FormField[],
): { overlays: OverlayObject[]; formFields: FormField[] } {
  const overlays = cloneData(snapshot.overlays);
  const values = snapshot.formValues;
  const nextFields = formFields.map((field) => {
    if (Object.prototype.hasOwnProperty.call(values, field.id)) {
      return { ...field, value: values[field.id]! };
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
