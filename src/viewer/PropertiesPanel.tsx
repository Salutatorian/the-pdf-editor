import { type ChangeEvent, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export type SelectionGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type FormFieldSelection = SelectionGeometry & {
  kind: 'formField';
  name?: string;
  fieldType?: string;
  value: string;
};

export type TextSelection = SelectionGeometry & {
  kind: 'text';
  content: string;
  fontSize?: number;
};

export type SignatureSelection = SelectionGeometry & {
  kind: 'signature';
  label?: string;
};

export type AnnotationSelection = SelectionGeometry & {
  kind: 'annotation' | 'image';
};

export type PropertiesSelection =
  | FormFieldSelection
  | TextSelection
  | SignatureSelection
  | AnnotationSelection;

export type PropertiesPanelProps = {
  selection: PropertiesSelection | null;
  onChange?: (patch: Partial<PropertiesSelection>) => void;
};

function numValue(e: ChangeEvent<HTMLInputElement>): number {
  const n = Number(e.target.value);
  return Number.isFinite(n) ? n : 0;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

export function PropertiesPanel({ selection, onChange }: PropertiesPanelProps) {
  if (!selection) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          Properties
        </div>
        <p className="px-3 py-6 text-xs text-muted-foreground">
          Select an object to edit its properties.
        </p>
      </div>
    );
  }

  const updateGeometry = (patch: Partial<SelectionGeometry>) => {
    onChange?.(patch);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          Properties
        </span>
        <Badge variant="outline" className="h-5 rounded-sm text-[10px] capitalize">
          {selection.kind}
        </Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="X">
              <Input
                className="h-7 text-xs"
                type="number"
                value={selection.x}
                aria-label="X"
                onChange={(e) => updateGeometry({ x: numValue(e) })}
              />
            </Field>
            <Field label="Y">
              <Input
                className="h-7 text-xs"
                type="number"
                value={selection.y}
                aria-label="Y"
                onChange={(e) => updateGeometry({ y: numValue(e) })}
              />
            </Field>
            <Field label="W">
              <Input
                className="h-7 text-xs"
                type="number"
                value={selection.width}
                aria-label="Width"
                onChange={(e) => updateGeometry({ width: numValue(e) })}
              />
            </Field>
            <Field label="H">
              <Input
                className="h-7 text-xs"
                type="number"
                value={selection.height}
                aria-label="Height"
                onChange={(e) => updateGeometry({ height: numValue(e) })}
              />
            </Field>
          </div>

          <Field label="Rotation">
            <Input
              className="h-7 text-xs"
              type="number"
              value={selection.rotation}
              aria-label="Rotation"
              onChange={(e) => updateGeometry({ rotation: numValue(e) })}
            />
          </Field>

          {selection.kind === 'formField' ? (
            <>
              {selection.name ? (
                <div className="text-xs">
                  <div className="text-[10px] text-muted-foreground uppercase">
                    Field
                  </div>
                  <div className="mt-0.5 font-medium">{selection.name}</div>
                </div>
              ) : null}
              <Field label="Value">
                <textarea
                  className="min-h-16 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={selection.value}
                  aria-label="Field value"
                  onChange={(e) => onChange?.({ value: e.target.value })}
                />
              </Field>
            </>
          ) : null}

          {selection.kind === 'text' ? (
            <>
              <Field label="Content">
                <textarea
                  className="min-h-16 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={selection.content}
                  aria-label="Text content"
                  onChange={(e) => onChange?.({ content: e.target.value })}
                />
              </Field>
              {selection.fontSize !== undefined ? (
                <Field label="Font size">
                  <Input
                    className="h-7 text-xs"
                    type="number"
                    value={selection.fontSize}
                    aria-label="Font size"
                    onChange={(e) => onChange?.({ fontSize: numValue(e) })}
                  />
                </Field>
              ) : null}
            </>
          ) : null}

          {selection.kind === 'signature' && selection.label ? (
            <div className="text-xs">
              <div className="text-[10px] text-muted-foreground uppercase">
                Signature
              </div>
              <div className="mt-0.5 font-medium">{selection.label}</div>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
