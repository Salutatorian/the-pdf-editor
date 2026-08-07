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

function fieldHint(field: FormField): string {
  if (field.placeholder === '') return '';
  if (field.placeholder) return field.placeholder;
  if (/^text\d+$/i.test(field.name.replace(/#\d+$/, ''))) return '';
  const fromName = field.name
    .replace(/^smartfill:/i, '')
    .replace(/#\d+$/i, '')
    .replace(/:[a-f0-9-]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (
    fromName &&
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

  const inputRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!focusedFieldId) return;
    const el = inputRefs.current.get(focusedFieldId);
    el?.focus();
  }, [focusedFieldId]);

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

  if (!active && pageSuggestions.length === 0) {
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
      {active
        ? pageFields.map((field) => {
            const style = {
              left: field.rect.x * scale,
              top: field.rect.y * scale,
              width: Math.max(4, field.rect.width * scale),
              height: Math.max(4, field.rect.height * scale),
              fontSize: Math.max(
                9,
                Math.min(14, field.rect.height * scale * 0.72),
              ),
              pointerEvents: 'auto' as const,
            };

            const setRef = (el: HTMLElement | null) => {
              if (el) inputRefs.current.set(field.id, el);
              else inputRefs.current.delete(field.id);
            };

            const hint = fieldHint(field);
            const asCheckbox =
              field.type === 'checkbox' ||
              (field.type === 'text' &&
                field.rect.width <= 26 &&
                field.rect.height <= 26 &&
                Math.min(field.rect.width, field.rect.height) /
                  Math.max(field.rect.width, field.rect.height) >=
                  0.55);

            if (asCheckbox) {
              // Follow printed box size exactly through zoom — no fixed 14–18 cap
              const boxW = Math.max(8, field.rect.width * scale);
              const boxH = Math.max(8, field.rect.height * scale);
              const checked = isTruthyCheck(field.value);
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
                    left: field.rect.x * scale,
                    top: field.rect.y * scale,
                    width: boxW,
                    height: boxH,
                    fontSize: Math.max(8, Math.min(boxW, boxH) * 0.75),
                    pointerEvents: 'auto',
                  }}
                  title={hint || 'Check'}
                  aria-label={hint || 'Checkbox'}
                  aria-pressed={checked}
                  disabled={field.readOnly}
                  onClick={() =>
                    onFieldChange(field.id, checked ? 'false' : 'true')
                  }
                  onKeyDown={(e) => handleTab(e, field.id)}
                  onFocus={() => onFocusedFieldChange?.(field.id)}
                >
                  {checked ? 'X' : ''}
                </button>
              );
            }

            if (field.type === 'radio') {
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
              // Ink lives on the Konva overlay (draggable). Don't paint a second
              // opaque image here or steal pointer events over the date/text.
              if (signed) {
                return (
                  <button
                    key={field.id}
                    ref={setRef as (el: HTMLButtonElement | null) => void}
                    type="button"
                    className="form-overlay__field form-overlay__field--signature form-overlay__field--signature-ink"
                    style={{ ...style, pointerEvents: 'none' }}
                    aria-hidden
                    tabIndex={-1}
                    disabled
                  />
                );
              }
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
              // Always textarea: wrap inside the box (never spill sideways like Stirling).
              // Overflow clips to the printed field — only what fits is visible.
              const tall = field.rect.height >= 36;
              return (
                <textarea
                  key={field.id}
                  ref={setRef as (el: HTMLTextAreaElement | null) => void}
                  className={
                    tall
                      ? 'form-overlay__field form-overlay__field--text form-overlay__field--multiline'
                      : 'form-overlay__field form-overlay__field--text form-overlay__field--wrap'
                  }
                  style={{
                    ...style,
                    fontSize: Math.max(
                      9,
                      Math.min(
                        tall ? 13 : 14,
                        tall
                          ? 12 * Math.min(scale, 1.25)
                          : field.rect.height * scale * 0.72,
                      ),
                    ),
                  }}
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
          })
        : null}

      {pageSuggestions.map((s) => {
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
      })}
    </div>
  );
}
