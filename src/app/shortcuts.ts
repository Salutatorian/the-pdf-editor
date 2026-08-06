import { useEffect } from "react";

export type ShortcutAction =
  | "open"
  | "save"
  | "saveAs"
  | "print"
  | "search"
  | "undo"
  | "redo"
  | "delete"
  | "duplicate"
  | "nudgeLeft"
  | "nudgeRight"
  | "nudgeUp"
  | "nudgeDown"
  | "clearSelection"
  | "formTab"
  | "formShiftTab"
  | "zoomFitPage"
  | "zoomFitWidth"
  | "zoomPercent0"
  | "zoomPercent1"
  | "zoomPercent2"
  | "zoomPercent3"
  | "zoomPercent4"
  | "zoomPercent5"
  | "zoomPercent6"
  | "zoomPercent7"
  | "zoomPercent8"
  | "zoomPercent9";

export type ShortcutHandlers = Partial<
  Record<ShortcutAction, (event: KeyboardEvent) => void>
>;

export type ShortcutOptions = {
  /** When true, Tab/Shift+Tab are handled for form field navigation. */
  formNavEnabled?: boolean;
  enabled?: boolean;
};

type Chord = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: ShortcutAction;
};

/** Central shortcut map — display labels use Ctrl (maps to Meta on macOS). */
export const SHORTCUT_MAP: ReadonlyArray<{
  action: ShortcutAction;
  label: string;
  keys: string;
}> = [
  { action: "open", label: "Open", keys: "Ctrl+O" },
  { action: "save", label: "Save", keys: "Ctrl+S" },
  { action: "saveAs", label: "Save As", keys: "Ctrl+Shift+S" },
  { action: "print", label: "Print", keys: "Ctrl+P" },
  { action: "search", label: "Search", keys: "Ctrl+F" },
  { action: "undo", label: "Undo", keys: "Ctrl+Z" },
  { action: "redo", label: "Redo", keys: "Ctrl+Y / Ctrl+Shift+Z" },
  { action: "delete", label: "Delete selection", keys: "Delete / Backspace" },
  { action: "duplicate", label: "Duplicate", keys: "Ctrl+D" },
  { action: "nudgeLeft", label: "Nudge left", keys: "←" },
  { action: "nudgeRight", label: "Nudge right", keys: "→" },
  { action: "nudgeUp", label: "Nudge up", keys: "↑" },
  { action: "nudgeDown", label: "Nudge down", keys: "↓" },
  { action: "clearSelection", label: "Clear selection", keys: "Escape" },
  { action: "formTab", label: "Next form field", keys: "Tab" },
  { action: "zoomFitPage", label: "Fit page", keys: "Ctrl+0" },
  { action: "zoomFitWidth", label: "Fit width", keys: "Ctrl+1" },
  { action: "zoomPercent5", label: "Zoom 50%", keys: "5" },
] as const;

const CHORDS: Chord[] = [
  { key: "o", ctrl: true, action: "open" },
  { key: "s", ctrl: true, action: "save" },
  { key: "s", ctrl: true, shift: true, action: "saveAs" },
  { key: "p", ctrl: true, action: "print" },
  { key: "f", ctrl: true, action: "search" },
  { key: "z", ctrl: true, action: "undo" },
  { key: "y", ctrl: true, action: "redo" },
  { key: "z", ctrl: true, shift: true, action: "redo" },
  { key: "d", ctrl: true, action: "duplicate" },
  { key: "0", ctrl: true, action: "zoomFitPage" },
  { key: "1", ctrl: true, action: "zoomFitWidth" },
  { key: "delete", action: "delete" },
  { key: "backspace", action: "delete" },
  { key: "arrowleft", action: "nudgeLeft" },
  { key: "arrowright", action: "nudgeRight" },
  { key: "arrowup", action: "nudgeUp" },
  { key: "arrowdown", action: "nudgeDown" },
  { key: "escape", action: "clearSelection" },
  { key: "0", action: "zoomPercent0" },
  { key: "1", action: "zoomPercent1" },
  { key: "2", action: "zoomPercent2" },
  { key: "3", action: "zoomPercent3" },
  { key: "4", action: "zoomPercent4" },
  { key: "5", action: "zoomPercent5" },
  { key: "6", action: "zoomPercent6" },
  { key: "7", action: "zoomPercent7" },
  { key: "8", action: "zoomPercent8" },
  { key: "9", action: "zoomPercent9" },
];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
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
      // (except Escape, which we still allow to bubble for clear/cancel).
      if (inInput && !hasMod && e.key !== "Escape") {
        return;
      }

      // Form field tab navigation (document-level flag)
      if (formNavEnabled && e.key === "Tab" && !hasMod && !e.altKey) {
        const action: ShortcutAction = e.shiftKey ? "formShiftTab" : "formTab";
        const handler = handlers[action];
        if (handler) {
          e.preventDefault();
          handler(e);
        }
        return;
      }

      for (const chord of CHORDS) {
        if (!matchesChord(e, chord)) continue;
        const handler = handlers[chord.action];
        if (!handler) continue;
        e.preventDefault();
        handler(e);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers, formNavEnabled, enabled]);
}
