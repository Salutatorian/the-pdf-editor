import type { OverlayKind } from '../document/types.ts';

export type AddToolDef = {
  id: string;
  label: string;
  kind: OverlayKind;
  defaultWidth: number;
  defaultHeight: number;
  /** Single-letter keyboard shortcut while in Add mode */
  shortcut: string;
};

export const ADD_TOOLS: readonly AddToolDef[] = [
  {
    id: 'text',
    label: 'Text',
    kind: 'text',
    defaultWidth: 160,
    defaultHeight: 28,
    shortcut: 'T',
  },
  {
    id: 'image',
    label: 'Image',
    kind: 'image',
    defaultWidth: 160,
    defaultHeight: 120,
    shortcut: 'I',
  },
  {
    id: 'checkmark',
    label: 'Checkmark',
    kind: 'checkmark',
    defaultWidth: 24,
    defaultHeight: 24,
    shortcut: 'C',
  },
  {
    id: 'date',
    label: 'Date',
    kind: 'date',
    defaultWidth: 120,
    defaultHeight: 28,
    shortcut: 'D',
  },
  {
    id: 'initials',
    label: 'Initials',
    kind: 'initials',
    defaultWidth: 64,
    defaultHeight: 32,
    shortcut: 'N',
  },
  {
    id: 'highlight',
    label: 'Highlight',
    kind: 'highlight',
    defaultWidth: 160,
    defaultHeight: 24,
    shortcut: 'H',
  },
  {
    id: 'draw',
    label: 'Draw',
    kind: 'draw',
    defaultWidth: 200,
    defaultHeight: 120,
    shortcut: 'P',
  },
  {
    id: 'shape',
    label: 'Shape',
    kind: 'shape',
    defaultWidth: 120,
    defaultHeight: 80,
    shortcut: 'S',
  },
  {
    id: 'signature',
    label: 'Signature',
    kind: 'signature',
    defaultWidth: 200,
    defaultHeight: 60,
    shortcut: 'G',
  },
  {
    id: 'redact',
    label: 'Redact',
    kind: 'redact',
    defaultWidth: 120,
    defaultHeight: 24,
    shortcut: 'R',
  },
] as const;

/** Tools shown in Add mode (excludes signature — Sign mode only). */
export const ADD_MODE_TOOLS: readonly AddToolDef[] = ADD_TOOLS.filter(
  (t) => t.kind !== 'signature',
);

export function toolByShortcut(letter: string): AddToolDef | undefined {
  const key = letter.toUpperCase();
  return ADD_TOOLS.find((t) => t.shortcut === key);
}

export function toolByKind(kind: OverlayKind): AddToolDef | undefined {
  return ADD_TOOLS.find((t) => t.kind === kind);
}
