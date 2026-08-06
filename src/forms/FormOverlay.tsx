import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
} from 'react';
import type {
  FormField,
  OverlayKind,
  OverlayObject,
  SmartFillSuggestion,
} from '../document/types.ts';
import { toolByKind } from '../overlay/tools.ts';

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
  onCreateFromSuggestion: (overlay: Omit<OverlayObject, 'id'>) => void;
  onSignatureField: (field: FormField) => void;
  /** External focus request (tab navigation) */
  focusedFieldId?: string | null;
  onFocusedFieldChange?: (fieldId: string | null) => void;
};

function isTruthyCheck(value: string): boolean {
  return value === 'true' || value === 'Yes' || value === '1' || value === 'on';
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
  onRejectSuggestion,
  onCreateFromSuggestion,
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

  const pageSuggestions = useMemo(
    () =>
      suggestions.filter(
        (s) => s.pageIndex === pageIndex && !s.confirmed && smartFillEnabled,
      ),
    [suggestions, pageIndex, smartFillEnabled],
  );

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

  const confirmSuggestion = (suggestion: SmartFillSuggestion) => {
    onConfirmSuggestion(suggestion.id);
    const tool = toolByKind(suggestion.kind as OverlayKind);
    const kind = (tool?.kind ??
      (suggestion.kind === 'checkbox' ? 'checkmark' : 'text')) as OverlayKind;
    const defaults = tool ?? {
      kind,
      defaultWidth: suggestion.rect.width,
      defaultHeight: suggestion.rect.height,
    };
    onCreateFromSuggestion({
      pageIndex: suggestion.pageIndex,
      kind,
      x: suggestion.rect.x,
      y: suggestion.rect.y,
      width: suggestion.rect.width || defaults.defaultWidth,
      height: suggestion.rect.height || defaults.defaultHeight,
      rotation: 0,
      zIndex: 10,
      text:
        kind === 'date'
          ? new Date().toLocaleDateString()
          : kind === 'checkmark'
            ? '✓'
            : kind === 'text'
              ? ''
              : undefined,
      fontSize: 14,
      color: kind === 'highlight' ? '#ffe566' : '#111111',
    });
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
        pointerEvents: active || pageSuggestions.length > 0 ? 'auto' : 'none',
      }}
    >
      {active
        ? pageFields.map((field) => {
            const style = {
              left: field.rect.x * scale,
              top: field.rect.y * scale,
              width: Math.max(24, field.rect.width * scale),
              height: Math.max(18, field.rect.height * scale),
            } as const;

            const setRef = (el: HTMLElement | null) => {
              if (el) inputRefs.current.set(field.id, el);
              else inputRefs.current.delete(field.id);
            };

            if (field.type === 'checkbox') {
              return (
                <label
                  key={field.id}
                  className="form-overlay__field form-overlay__field--checkbox"
                  style={style}
                  title={field.name}
                >
                  <input
                    ref={setRef as (el: HTMLInputElement | null) => void}
                    type="checkbox"
                    checked={isTruthyCheck(field.value)}
                    disabled={field.readOnly}
                    aria-label={field.name}
                    onChange={(e) =>
                      onFieldChange(field.id, e.target.checked ? 'true' : 'false')
                    }
                    onKeyDown={(e) => handleTab(e, field.id)}
                    onFocus={() => onFocusedFieldChange?.(field.id)}
                  />
                </label>
              );
            }

            if (field.type === 'radio') {
              return (
                <label
                  key={field.id}
                  className="form-overlay__field form-overlay__field--radio"
                  style={style}
                  title={field.name}
                >
                  <input
                    ref={setRef as (el: HTMLInputElement | null) => void}
                    type="radio"
                    name={field.groupName ?? field.name}
                    checked={Boolean(field.value)}
                    disabled={field.readOnly}
                    aria-label={field.name}
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
                  aria-label={field.name}
                  onChange={(e) => onFieldChange(field.id, e.target.value)}
                  onKeyDown={(e) => handleTab(e, field.id)}
                  onFocus={() => onFocusedFieldChange?.(field.id)}
                >
                  <option value="">—</option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              );
            }

            if (field.type === 'signature') {
              return (
                <button
                  key={field.id}
                  ref={setRef as (el: HTMLButtonElement | null) => void}
                  type="button"
                  className="form-overlay__field form-overlay__field--signature"
                  style={style}
                  aria-label={`Sign ${field.name}`}
                  disabled={field.readOnly}
                  onClick={() => onSignatureField(field)}
                  onKeyDown={(e) => handleTab(e, field.id)}
                  onFocus={() => onFocusedFieldChange?.(field.id)}
                >
                  {field.value ? 'Signed' : 'Click to sign'}
                </button>
              );
            }

            if (field.type === 'date') {
              return (
                <input
                  key={field.id}
                  ref={setRef as (el: HTMLInputElement | null) => void}
                  className="form-overlay__field form-overlay__field--date"
                  type="date"
                  style={style}
                  value={field.value}
                  disabled={field.readOnly}
                  aria-label={field.name}
                  onChange={(e) => onFieldChange(field.id, e.target.value)}
                  onKeyDown={(e) => handleTab(e, field.id)}
                  onFocus={() => onFocusedFieldChange?.(field.id)}
                />
              );
            }

            return (
              <input
                key={field.id}
                ref={setRef as (el: HTMLInputElement | null) => void}
                className="form-overlay__field form-overlay__field--text"
                type="text"
                style={style}
                value={field.value}
                disabled={field.readOnly}
                aria-label={field.name}
                onChange={(e) => onFieldChange(field.id, e.target.value)}
                onKeyDown={(e) => handleTab(e, field.id)}
                onFocus={() => onFocusedFieldChange?.(field.id)}
              />
            );
          })
        : null}

      {pageSuggestions.map((s) => (
        <div
          key={s.id}
          className="form-overlay__suggestion"
          style={{
            left: s.rect.x * scale,
            top: s.rect.y * scale,
            width: Math.max(80, s.rect.width * scale),
            height: Math.max(28, s.rect.height * scale),
          }}
        >
          <span className="form-overlay__suggestion-label">
            {s.label ?? s.kind} ({Math.round(s.confidence * 100)}%)
          </span>
          <div className="form-overlay__suggestion-actions">
            <button
              type="button"
              className="form-overlay__btn form-overlay__btn--confirm"
              onClick={() => confirmSuggestion(s)}
            >
              Confirm
            </button>
            <button
              type="button"
              className="form-overlay__btn form-overlay__btn--reject"
              onClick={() => onRejectSuggestion(s.id)}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function nextFormFieldId(
  fields: FormField[],
  currentId: string | null,
  direction: 1 | -1,
): string | null {
  const sorted = [...fields].sort(
    (a, b) =>
      a.pageIndex - b.pageIndex || a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  );
  if (sorted.length === 0) return null;
  if (!currentId) return sorted[0]?.id ?? null;
  const idx = sorted.findIndex((f) => f.id === currentId);
  if (idx < 0) return sorted[0]?.id ?? null;
  const next = sorted[(idx + direction + sorted.length) % sorted.length];
  return next?.id ?? null;
}
