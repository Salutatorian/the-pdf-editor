import type { FormField, OverlayObject } from '../document/types.ts';
import { cloneData } from '../document/history.ts';

const STORAGE_KEY = 'pdf_editor:annotation-layers.v1';

export type AnnotationLayer = {
  path: string;
  overlays: OverlayObject[];
  formFields: FormField[];
  savedAt: number;
};

type LayerMap = Record<string, AnnotationLayer>;

function readMap(): LayerMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as LayerMap;
  } catch {
    return {};
  }
}

function writeMap(map: LayerMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/** Durable edit layer — kept after save so reopen stays re-editable. */
export function saveAnnotationLayer(args: {
  path: string;
  overlays: OverlayObject[];
  formFields: FormField[];
}): AnnotationLayer {
  const layer: AnnotationLayer = {
    path: args.path,
    overlays: cloneData(args.overlays),
    formFields: cloneData(args.formFields),
    savedAt: Date.now(),
  };
  const map = readMap();
  map[args.path] = layer;
  writeMap(map);
  return layer;
}

export function loadAnnotationLayer(path: string): AnnotationLayer | null {
  const layer = readMap()[path];
  if (!layer) return null;
  if (!Array.isArray(layer.overlays) || !Array.isArray(layer.formFields)) {
    return null;
  }
  return layer;
}

export function clearAnnotationLayer(path: string): void {
  const map = readMap();
  if (!(path in map)) return;
  delete map[path];
  writeMap(map);
}
