import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
} from 'react';
import type {
  FormField,
  OverlayObject,
  SmartFillSuggestion,
} from '../document/types.ts';
import { formFieldCssFontSize } from './formFieldTypography.ts';

export type FormOverlayProps = {
  pageIndex: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  fields: FormField[];
  suggestions: SmartFillSuggestion[];
  smartFillEnabled: boolean;
  active: boolean;
  onFieldChange: (fieldId: string, value: string) => void;
  onConfirmSuggestion: (id: string) => void;
  onRejectSuggestion: (id: string) => void;
  onAcceptAllSuggestions?: () => void;
  /** @deprecated overlays no longer created from Smart Fill — kept for API compat */
  onCreateFromSuggestion?: (overlay: Omit<OverlayObject, 'id'>) => void;
  onSignatureField: (field: FormField) => void;
  focusedFieldId?: string | null;
  onFocusedFieldChange?: (fieldId: string | null) => void;
};

function isTruthyCheck(value: string): boolean {
  return value === 'true' || value === 'Yes' || value === '1' || value === 'on';
}

/** Values that should stay visible in View/Add/Sign (like Add Text overlays). */
function fieldHasCommittedValue(field: FormField): boolean {
  if (field.type === 'checkbox' || field.type === 'radio') {
    return isTruthyCheck(field.value);
  }
  if (field.type === 'signature') {
    return field.value.startsWith('data:image/');
  }
  const v = field.value?.trim() ?? '';
  if (!v || v.startsWith('data:image/')) return false;
  return true;
}

function fieldHint(field: FormField): string {
  // Explicit empty placeholder = keep the box quiet (AcroForm names look like junk fill)
  if (field.placeholder === '') return '';
  if (field.placeholder) return field.placeholder;
  if (field.type === 'checkbox' || field.type === 'radio') return '';
  if (/^text\d+$/i.test(field.name.replace(/#\d+$/, ''))) return '';
  // Smart Fill–named fields may use a short label; never paint raw AcroForm names
  if (!/^smartfill:/i.test(field.name)) return '';
  const fromName = field.name
    .replace(/^smartfill:/i, '')
    .replace(/#\d+$/i, '')
    .replace(/:[a-f0-9-]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (
    fromName &&
    fromName.length <= 24 &&
    !/\d+$/.test(fromName) &&
    !/^field/i.test(fromName) &&
    !/^text\d+$/i.test(fromName)
  ) {
    return fromName;
  }
  if (field.type === 'date') return 'Date';
  if (field.type === 'signature') return 'Signature';
  return '';
}

export function FormOverlay({
  pageIndex,
  scale,
  fields,
  suggestions,
  smartFillEnabled,
  active,
  onFieldChange,
  onConfirmSuggestion,
  onRejectSuggestion: _onRejectSuggestion,
  onAcceptAllSuggestions: _onAcceptAllSuggestions,
  onSignatureField,
  focusedFieldId,
  onFocusedFieldChange,
}: FormOverlayProps) {
  const pageFields = useMemo(
    () =>
      fields
        .filter((f) => f.pageIndex === pageIndex)
        .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x),
    [fields, pageIndex],
  );

  // Only show suggestion chrome when not already covered by a real field
  const pageSuggestions = useMemo(() => {
    if (!smartFillEnabled) return [];
    return suggestions.filter((s) => {
      if (s.pageIndex !== pageIndex || s.confirmed) return false;
      return !pageFields.some(
        (f) =>
          !(
            f.rect.x + f.rect.width < s.rect.x ||
            s.rect.x + s.rect.width < f.rect.x ||
            f.rect.y + f.rect.height < s.rect.y ||
            s.rect.y + s.rect.height < f.rect.y
          ),
      );
    });
  }, [suggestions, pageIndex, smartFillEnabled, pageFields]);

  const visibleFields = useMemo(
    () => (active ? pageFields : pageFields.filter(fieldHasCommittedValue)),
    [active, pageFields],
  );

  const inputRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!focusedFieldId || !active) return;
    const el = inputRefs.current.get(focusedFieldId);
    el?.focus();
  }, [focusedFieldId, active]);

  const handleTab = useCallback(
    (e: KeyboardEvent, currentId: string) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const idx = pageFields.findIndex((f) => f.id === currentId);
      if (idx < 0) return;
      const nextIdx = e.shiftKey
        ? (idx - 1 + pageFields.length) % pageFields.length
        : (idx + 1) % pageFields.length;
      const next = pageFields[nextIdx];
      if (!next) return;
      onFocusedFieldChange?.(next.id);
      inputRefs.current.get(next.id)?.focus();
    },
    [pageFields, onFocusedFieldChange],
  );

  const activateSuggestion = (suggestion: SmartFillSuggestion) => {
    onConfirmSuggestion(suggestion.id);
    onFocusedFieldChange?.(suggestion.id);
  };

  // View/Add/Sign: still show filled ink (same as Add Text overlays stay visible).
  // Fill: show all interactive fields. Suggestions only while Fill + Smart Fill on.
  if (visibleFields.length === 0 && pageSuggestions.length === 0) {
    return null;
  }

  return (
    <div
      className="form-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        // Don't capture the whole page when inactive — Sign / Add tools need clicks
        pointerEvents: 'none',
      }}
    >
      {visibleFields.map((field) => {
            const interactive = active && !field.readOnly;
            const style = {
              left: field.rect.x * scale,
              top: field.rect.y * scale,
              width: Math.max(4, field.rect.width * scale),
              height: Math.max(4, field.rect.height * scale),
              fontSize: formFieldCssFontSize(field.rect, scale),
              pointerEvents: (interactive ? 'auto' : 'none') as 'auto' | 'none',
            };

            const setRef = (el: HTMLElement | null) => {
              if (el) inputRefs.current.set(field.id, el);
              else inputRefs.current.delete(field.id);
            };

            const hint = fieldHint(field);
            const asCheckbox =
              field.type === 'checkbox' ||
              (field.type === 'text' &&
                field.rect.width <= 32 &&
                field.rect.height <= 32 &&
                Math.min(field.rect.width, field.rect.height) /
                  Math.max(field.rect.width, field.rect.height) >=
                  0.55);

            if (asCheckbox) {
              const boxW = Math.max(8, field.rect.width * scale);
              const boxH = Math.max(8, field.rect.height * scale);
              const hit = interactive
                ? Math.max(22, boxW, boxH)
                : Math.max(boxW, boxH);
              const padX = (hit - boxW) / 2;
              const padY = (hit - boxH) / 2;
              const checked = isTruthyCheck(field.value);
              if (!active && !checked) return null;
              const toggle = () => {
                if (!interactive) return;
                onFieldChange(field.id, checked ? 'false' : 'true');
              };
              if (!interactive) {
                return (
                  <div
                    key={field.id}
                    className="form-overlay__check form-overlay__check--on form-overlay__check--ink"
                    style={{
                      left: field.rect.x * scale - padX,
                      top: field.rect.y * scale - padY,
                      width: hit,
                      height: hit,
                      fontSize: Math.max(8, Math.min(boxW, boxH) * 0.75),
                      pointerEvents: 'none',
                      zIndex: 5,
                    }}
                    aria-hidden
                  >
                    X
                  </div>
                );
              }
              return (
                <button
                  key={field.id}
                  ref={setRef as (el: HTMLButtonElement | null) => void}
                  type="button"
                  className={
                    checked
                      ? 'form-overlay__check form-overlay__check--on'
                      : 'form-overlay__check'
                  }
                  style={{
                    left: field.rect.x * scale - padX,
                    top: field.rect.y * scale - padY,
                    width: hit,
                    height: hit,
                    fontSize: Math.max(8, Math.min(boxW, boxH) * 0.75),
                    pointerEvents: 'auto',
                    zIndex: 20,
                  }}
                  title={hint || 'Check'}
                  aria-label={hint || 'Checkbox'}
                  aria-pressed={checked}
                  disabled={field.readOnly}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggle();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      toggle();
                      return;
                    }
                    handleTab(e, field.id);
                  }}
                  onFocus={() => onFocusedFieldChange?.(field.id)}
                >
                  {checked ? 'X' : ''}
                </button>
              );
            }

            if (field.type === 'radio') {
              if (!active && !field.value) return null;
              if (!interactive) {
                return (
                  <div
                    key={field.id}
                    className="form-overlay__field form-overlay__field--radio form-overlay__field--ink"
                    style={style}
                    aria-hidden
                  >
                    ●
                  </div>
                );
              }
              return (
                <label
                  key={field.id}
                  className="form-overlay__field form-overlay__field--radio"
                  style={style}
                  title={hint}
                >
                  <input
                    ref={setRef as (el: HTMLInputElement | null) => void}
                    type="radio"
                    name={field.groupName ?? field.name}
                    checked={Boolean(field.value)}
                    disabled={field.readOnly}
                    aria-label={hint}
                    onChange={() =>
                      onFieldChange(field.id, field.options?.[0] ?? 'Yes')
                    }
                    onKeyDown={(e) => handleTab(e, field.id)}
                    onFocus={() => onFocusedFieldChange?.(field.id)}
                  />
                </label>
              );
            }

            if (field.type === 'dropdown') {
              if (!active && !field.value.trim()) return null;
              if (!interactive) {
                return (
                  <div
                    key={field.id}
                    className="form-overlay__field form-overlay__field--text form-overlay__field--ink"
                    style={style}
                    aria-hidden
                  >
                    {field.value}
                  </div>
                );
              }
              return (
                <select
                  key={field.id}
                  ref={setRef as (el: HTMLSelectElement | null) => void}
                  className="form-overlay__field form-overlay__field--select"
                  style={style}
                  value={field.value}
                  disabled={field.readOnly}
                  aria-label={hint}
                  onChange={(e) => onFieldChange(field.id, e.target.value)}
                  onKeyDown={(e) => handleTab(e, field.id)}
                  onFocus={() => onFocusedFieldChange?.(field.id)}
                >
                  <option value="">{hint}</option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              );
            }

            if (field.type === 'signature') {
              const signed = field.value.startsWith('data:image/');
              // Ink lives on the Konva overlay (draggable). Once signed, render
              // NOTHING here — leaving a label box would desync from the ink.
              if (signed) return null;
              if (!active) return null;
              return (
                <button
                  key={field.id}
                  ref={setRef as (el: HTMLButtonElement | null) => void}
                  type="button"
                  className="form-overlay__field form-overlay__field--signature"
                  style={style}
                  aria-label={`Sign ${hint || 'here'}`}
                  disabled={field.readOnly}
                  onClick={() => onSignatureField(field)}
                  onKeyDown={(e) => handleTab(e, field.id)}
                  onFocus={() => onFocusedFieldChange?.(field.id)}
                >
                  {hint || 'Sign here'}
                </button>
              );
            }

            if (field.type === 'date' || field.type === 'text') {
              const tall = field.rect.height >= 28;
              if (!interactive) {
                return (
                  <div
                    key={field.id}
                    className={
                      tall
                        ? 'form-overlay__field form-overlay__field--text form-overlay__field--multiline form-overlay__field--ink'
                        : 'form-overlay__field form-overlay__field--text form-overlay__field--wrap form-overlay__field--ink'
                    }
                    style={style}
                    aria-hidden
                  >
                    {field.value}
                  </div>
                );
              }
              return (
                <textarea
                  key={field.id}
                  ref={setRef as (el: HTMLTextAreaElement | null) => void}
                  className={
                    tall
                      ? 'form-overlay__field form-overlay__field--text form-overlay__field--multiline'
                      : 'form-overlay__field form-overlay__field--text form-overlay__field--wrap'
                  }
                  style={style}
                  value={field.value}
                  disabled={field.readOnly}
                  aria-label={
                    field.type === 'date' ? hint || 'Date' : hint
                  }
                  title={
                    field.type === 'date'
                      ? 'Type any date format (e.g. 31/12/2026 or Dec 31, 2026)'
                      : hint
                  }
                  placeholder={
                    field.type === 'date' ? hint || 'Date' : hint
                  }
                  rows={1}
                  wrap="soft"
                  onChange={(e) => onFieldChange(field.id, e.target.value)}
                  onKeyDown={(e) => handleTab(e, field.id)}
                  onFocus={() => onFocusedFieldChange?.(field.id)}
                />
              );
            }

            return null;
          })}

      {active
        ? pageSuggestions.map((s) => {
        const style = {
          left: s.rect.x * scale,
          top: s.rect.y * scale,
          width: Math.max(80, s.rect.width * scale),
          height: Math.max(28, s.rect.height * scale),
          pointerEvents: 'auto' as const,
        };
        const hint = (s.label ?? s.kind).replace(/:+\s*$/, '');

        if (s.kind === 'signature') {
          return (
            <button
              key={s.id}
              type="button"
              className="form-overlay__field form-overlay__field--signature"
              style={style}
              aria-label={`Sign ${hint}`}
              onClick={() => {
                activateSuggestion(s);
                onSignatureField({
                  id: s.id,
                  name: `smartfill:${s.label ?? 'signature'}`,
                  type: 'signature',
                  pageIndex: s.pageIndex,
                  rect: { ...s.rect },
                  value: '',
                  synthetic: true,
                  placeholder: hint,
                });
              }}
            >
              {hint || 'Sign here'}
            </button>
          );
        }

        if (s.kind === 'checkbox') {
          const box = 14 * Math.max(scale, 1);
          const checked = false;
          return (
            <button
              key={s.id}
              type="button"
              className="form-overlay__check"
              style={{
                left: s.rect.x * scale,
                top: s.rect.y * scale,
                width: box,
                height: box,
                pointerEvents: 'auto',
              }}
              title={hint}
              aria-label={hint}
              onClick={() => {
                activateSuggestion(s);
                window.setTimeout(() => onFieldChange(s.id, 'true'), 0);
              }}
            >
              {checked ? 'X' : ''}
            </button>
          );
        }

        return (
          <div
            key={s.id}
            className="form-overlay__suggestion form-overlay__suggestion--live"
            style={style}
          >
            <input
              className="form-overlay__suggestion-input"
              type="text"
              placeholder={hint}
              aria-label={hint}
              onFocus={() => activateSuggestion(s)}
              onChange={(e) => {
                const value = e.target.value;
                activateSuggestion(s);
                onFieldChange(s.id, value);
              }}
            />
          </div>
        );
      })
        : null}
    </div>
  );
}
