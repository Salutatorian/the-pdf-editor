import { useEffect } from 'react';

export type ShortcutAction =
  | 'open'
  | 'save'
  | 'saveAs'
  | 'print'
  | 'search'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'duplicate'
  | 'selectAll'
  | 'nudgeLeft'
  | 'nudgeRight'
  | 'nudgeUp'
  | 'nudgeDown'
  | 'clearSelection'
  | 'formTab'
  | 'formShiftTab'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'zoomFitPage'
  | 'zoomFitWidth'
  | 'zoom100'
  | 'zoom200'
  | 'zoom50'
  | 'pagePrev'
  | 'pageNext'
  | 'pageFirst'
  | 'pageLast'
  | 'modeView'
  | 'modeFill'
  | 'modeAdd'
  | 'modeSign'
  | 'modeOrganize'
  | 'toggleSidebar'
  | 'showShortcuts';

export type ShortcutHandlers = Partial<
  Record<ShortcutAction, (event: KeyboardEvent) => void>
>;

export type ShortcutOptions = {
  /** When true, Tab/Shift+Tab are handled for form field navigation. */
  formNavEnabled?: boolean;
  enabled?: boolean;
};

export type ShortcutCategory =
  | 'File'
  | 'Edit'
  | 'View & zoom'
  | 'Navigate'
  | 'Modes'
  | 'Fill'
  | 'Help';

export type ShortcutHelpEntry = {
  action: ShortcutAction;
  label: string;
  keys: string;
  category: ShortcutCategory;
};

type Chord = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: ShortcutAction;
};

/** Full list for the Keyboard shortcuts dialog (and tooltips). */
export const SHORTCUT_HELP: ReadonlyArray<ShortcutHelpEntry> = [
  { action: 'open', label: 'Open PDF', keys: 'Ctrl+O', category: 'File' },
  { action: 'save', label: 'Save', keys: 'Ctrl+S', category: 'File' },
  {
    action: 'saveAs',
    label: 'Save As',
    keys: 'Ctrl+Shift+S',
    category: 'File',
  },
  { action: 'print', label: 'Print', keys: 'Ctrl+P', category: 'File' },

  { action: 'undo', label: 'Undo', keys: 'Ctrl+Z', category: 'Edit' },
  {
    action: 'redo',
    label: 'Redo',
    keys: 'Ctrl+Y / Ctrl+Shift+Z',
    category: 'Edit',
  },
  {
    action: 'delete',
    label: 'Delete selection',
    keys: 'Delete / Backspace',
    category: 'Edit',
  },
  {
    action: 'duplicate',
    label: 'Duplicate selection',
    keys: 'Ctrl+D',
    category: 'Edit',
  },
  {
    action: 'selectAll',
    label: 'Select all overlays',
    keys: 'Ctrl+A',
    category: 'Edit',
  },
  {
    action: 'nudgeLeft',
    label: 'Nudge selection',
    keys: '← ↑ → ↓ (Shift = larger)',
    category: 'Edit',
  },
  {
    action: 'clearSelection',
    label: 'Clear selection / cancel',
    keys: 'Escape',
    category: 'Edit',
  },

  {
    action: 'zoomIn',
    label: 'Zoom in',
    keys: 'Ctrl+Plus / Ctrl+=',
    category: 'View & zoom',
  },
  {
    action: 'zoomOut',
    label: 'Zoom out',
    keys: 'Ctrl+Minus',
    category: 'View & zoom',
  },
  {
    action: 'zoomReset',
    label: 'Zoom 100%',
    keys: 'Ctrl+2',
    category: 'View & zoom',
  },
  {
    action: 'zoomFitPage',
    label: 'Fit page',
    keys: 'Ctrl+0',
    category: 'View & zoom',
  },
  {
    action: 'zoomFitWidth',
    label: 'Fit width',
    keys: 'Ctrl+1',
    category: 'View & zoom',
  },
  {
    action: 'zoom200',
    label: 'Zoom 200%',
    keys: 'Ctrl+3',
    category: 'View & zoom',
  },
  {
    action: 'zoom50',
    label: 'Zoom 50%',
    keys: 'Ctrl+5',
    category: 'View & zoom',
  },
  {
    action: 'zoomIn',
    label: 'Zoom with scroll wheel',
    keys: 'Ctrl + scroll wheel',
    category: 'View & zoom',
  },
  {
    action: 'zoomIn',
    label: 'Zoom with middle mouse',
    keys: 'Ctrl + hold middle mouse + drag',
    category: 'View & zoom',
  },

  {
    action: 'pagePrev',
    label: 'Previous page',
    keys: 'Page Up / Shift+Space',
    category: 'Navigate',
  },
  {
    action: 'pageNext',
    label: 'Next page',
    keys: 'Page Down / Space',
    category: 'Navigate',
  },
  {
    action: 'pageFirst',
    label: 'First page',
    keys: 'Home',
    category: 'Navigate',
  },
  {
    action: 'pageLast',
    label: 'Last page',
    keys: 'End',
    category: 'Navigate',
  },
  { action: 'search', label: 'Search', keys: 'Ctrl+F', category: 'Navigate' },
  {
    action: 'toggleSidebar',
    label: 'Toggle sidebar',
    keys: 'Ctrl+B',
    category: 'Navigate',
  },

  {
    action: 'modeView',
    label: 'View mode',
    keys: 'Alt+1',
    category: 'Modes',
  },
  {
    action: 'modeFill',
    label: 'Fill mode',
    keys: 'Alt+2',
    category: 'Modes',
  },
  { action: 'modeAdd', label: 'Add mode', keys: 'Alt+3', category: 'Modes' },
  {
    action: 'modeSign',
    label: 'Sign mode',
    keys: 'Alt+4',
    category: 'Modes',
  },
  {
    action: 'modeOrganize',
    label: 'Organize mode',
    keys: 'Alt+5',
    category: 'Modes',
  },

  {
    action: 'formTab',
    label: 'Next form field',
    keys: 'Tab',
    category: 'Fill',
  },
  {
    action: 'formShiftTab',
    label: 'Previous form field',
    keys: 'Shift+Tab',
    category: 'Fill',
  },

  {
    action: 'showShortcuts',
    label: 'Show this list',
    keys: 'Ctrl+/  or  F1  or  ?',
    category: 'Help',
  },
] as const;

/** @deprecated use SHORTCUT_HELP — kept for older imports */
export const SHORTCUT_MAP = SHORTCUT_HELP;

const CHORDS: Chord[] = [
  { key: 'o', ctrl: true, action: 'open' },
  { key: 's', ctrl: true, action: 'save' },
  { key: 's', ctrl: true, shift: true, action: 'saveAs' },
  { key: 'p', ctrl: true, action: 'print' },
  { key: 'f', ctrl: true, action: 'search' },
  { key: 'z', ctrl: true, action: 'undo' },
  { key: 'y', ctrl: true, action: 'redo' },
  { key: 'z', ctrl: true, shift: true, action: 'redo' },
  { key: 'd', ctrl: true, action: 'duplicate' },
  { key: 'a', ctrl: true, action: 'selectAll' },
  { key: 'b', ctrl: true, action: 'toggleSidebar' },
  { key: '/', ctrl: true, action: 'showShortcuts' },
  { key: '?', action: 'showShortcuts' },
  { key: 'f1', action: 'showShortcuts' },

  { key: '0', ctrl: true, action: 'zoomFitPage' },
  { key: '1', ctrl: true, action: 'zoomFitWidth' },
  { key: '2', ctrl: true, action: 'zoom100' },
  { key: '3', ctrl: true, action: 'zoom200' },
  { key: '5', ctrl: true, action: 'zoom50' },

  { key: '1', alt: true, action: 'modeView' },
  { key: '2', alt: true, action: 'modeFill' },
  { key: '3', alt: true, action: 'modeAdd' },
  { key: '4', alt: true, action: 'modeSign' },
  { key: '5', alt: true, action: 'modeOrganize' },

  { key: 'delete', action: 'delete' },
  { key: 'backspace', action: 'delete' },
  { key: 'arrowleft', action: 'nudgeLeft' },
  { key: 'arrowright', action: 'nudgeRight' },
  { key: 'arrowup', action: 'nudgeUp' },
  { key: 'arrowdown', action: 'nudgeDown' },
  { key: 'escape', action: 'clearSelection' },
  { key: 'pageup', action: 'pagePrev' },
  { key: 'pagedown', action: 'pageNext' },
  { key: 'home', action: 'pageFirst' },
  { key: 'end', action: 'pageLast' },
  { key: ' ', action: 'pageNext' },
  { key: ' ', shift: true, action: 'pagePrev' },
];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

function matchesChord(e: KeyboardEvent, chord: Chord): boolean {
  const key = e.key.toLowerCase();
  if (key !== chord.key) return false;

  const mod = e.ctrlKey || e.metaKey;
  const wantsMod = Boolean(chord.ctrl || chord.meta);
  if (wantsMod !== mod) return false;
  if (Boolean(chord.shift) !== e.shiftKey) return false;
  if (Boolean(chord.alt) !== e.altKey) return false;
  return true;
}

/** Ctrl/Cmd + / - / = / Numpad — zoom chords browsers treat specially. */
function matchZoomChord(e: KeyboardEvent): 'zoomIn' | 'zoomOut' | null {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey) return null;
  const { key, code } = e;
  if (
    key === '+' ||
    key === '=' ||
    code === 'Equal' ||
    code === 'NumpadAdd'
  ) {
    return 'zoomIn';
  }
  if (
    key === '-' ||
    key === '_' ||
    code === 'Minus' ||
    code === 'NumpadSubtract'
  ) {
    return 'zoomOut';
  }
  return null;
}

export function groupShortcutsByCategory(): Array<{
  category: ShortcutCategory;
  items: ShortcutHelpEntry[];
}> {
  const order: ShortcutCategory[] = [
    'File',
    'Edit',
    'View & zoom',
    'Navigate',
    'Modes',
    'Fill',
    'Help',
  ];
  return order.map((category) => ({
    category,
    items: SHORTCUT_HELP.filter((s) => s.category === category),
  }));
}

export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  options: ShortcutOptions = {},
): void {
  const { formNavEnabled = false, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const inInput = isEditableTarget(e.target);
      const hasMod = e.ctrlKey || e.metaKey;

      // Don't steal plain keys from inputs/textareas unless a modifier is held
      if (inInput && !hasMod && e.key !== 'Escape' && e.key !== 'F1') {
        return;
      }
      // Space in inputs should type a space, not page-next
      if (inInput && (e.key === ' ' || e.key === 'PageUp' || e.key === 'PageDown')) {
        return;
      }

      const zoomAction = matchZoomChord(e);
      if (zoomAction) {
        const handler = handlers[zoomAction];
        if (handler) {
          e.preventDefault();
          handler(e);
          return;
        }
      }

      if (formNavEnabled && e.key === 'Tab' && !hasMod && !e.altKey) {
        const action: ShortcutAction = e.shiftKey ? 'formShiftTab' : 'formTab';
        const handler = handlers[action];
        if (handler) {
          e.preventDefault();
          handler(e);
        }
        return;
      }

      for (const chord of CHORDS) {
        if (!matchesChord(e, chord)) continue;
        // Space/arrows only nudge when not filling form focus randomly —
        // still OK outside inputs.
        const handler = handlers[chord.action];
        if (!handler) continue;
        e.preventDefault();
        handler(e);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers, formNavEnabled, enabled]);
}
