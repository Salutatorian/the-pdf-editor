import { describe, expect, it } from 'vitest';
import {
  applySnapshot,
  canRedo,
  canUndo,
  createSnapshot,
} from './history.ts';
import type { FormField, OverlayObject } from './types.ts';

function overlay(partial: Partial<OverlayObject> & { id: string }): OverlayObject {
  return {
    pageIndex: 0,
    kind: 'text',
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    rotation: 0,
    zIndex: 1,
    text: 'hi',
    ...partial,
  };
}

function field(id: string, value: string): FormField {
  return {
    id,
    name: id,
    type: 'text',
    pageIndex: 0,
    rect: { x: 0, y: 0, width: 100, height: 20 },
    value,
  };
}

describe('history helpers', () => {
  it('createSnapshot clones overlays and form values', () => {
    const overlays = [overlay({ id: 'a', text: 'one' })];
    const fields = [field('f1', 'alpha')];
    const snap = createSnapshot(overlays, fields);

    overlays[0]!.text = 'mutated';
    fields[0]!.value = 'mutated';

    expect(snap.overlays[0]!.text).toBe('one');
    expect(snap.formValues.f1).toBe('alpha');
  });

  it('applySnapshot restores overlays and form values', () => {
    const snap = createSnapshot(
      [overlay({ id: 'a', text: 'saved' })],
      [field('f1', 'v1')],
    );
    const restored = applySnapshot(snap, [field('f1', 'changed')]);
    expect(restored.overlays[0]!.text).toBe('saved');
    expect(restored.formFields[0]!.value).toBe('v1');
  });

  it('canUndo / canRedo reflect stack lengths', () => {
    expect(canUndo({ undoStack: [], redoStack: [] })).toBe(false);
    expect(canRedo({ undoStack: [], redoStack: [] })).toBe(false);

    const entry = createSnapshot([], []);
    expect(canUndo({ undoStack: [entry], redoStack: [] })).toBe(true);
    expect(canRedo({ undoStack: [], redoStack: [entry] })).toBe(true);
  });

  it('supports undo then redo semantics via stacks', () => {
    const undoStack = [
      createSnapshot([overlay({ id: 'a', text: 'v1' })], [field('f', '1')]),
    ];
    const redoStack: ReturnType<typeof createSnapshot>[] = [];

    // undo
    expect(canUndo({ undoStack, redoStack })).toBe(true);
    const previous = undoStack.pop()!;
    const current = createSnapshot(
      [overlay({ id: 'a', text: 'v2' })],
      [field('f', '2')],
    );
    redoStack.push(current);
    const afterUndo = applySnapshot(previous, [field('f', '2')]);
    expect(afterUndo.overlays[0]!.text).toBe('v1');
    expect(afterUndo.formFields[0]!.value).toBe('1');

    // redo
    expect(canRedo({ undoStack, redoStack })).toBe(true);
    const next = redoStack.pop()!;
    undoStack.push(createSnapshot(afterUndo.overlays, afterUndo.formFields));
    const afterRedo = applySnapshot(next, afterUndo.formFields);
    expect(afterRedo.overlays[0]!.text).toBe('v2');
    expect(afterRedo.formFields[0]!.value).toBe('2');
  });

  it('clones signature overlays with large data URLs without throwing', () => {
    const dataUrl = `data:image/png;base64,${'A'.repeat(2000)}`;
    const overlays = [
      overlay({
        id: 'sig',
        kind: 'signature',
        imageDataUrl: dataUrl,
        text: undefined,
      }),
    ];
    const snap = createSnapshot(overlays, []);
    expect(snap.overlays[0]!.imageDataUrl).toBe(dataUrl);
    const restored = applySnapshot(snap, []);
    expect(restored.overlays[0]!.imageDataUrl).toBe(dataUrl);
  });
});
