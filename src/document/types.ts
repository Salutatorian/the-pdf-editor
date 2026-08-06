export type AppMode = 'open' | 'view' | 'fill' | 'add' | 'sign' | 'organize';

export type OverlayKind =
  | 'text'
  | 'image'
  | 'checkmark'
  | 'date'
  | 'initials'
  | 'highlight'
  | 'draw'
  | 'shape'
  | 'signature'
  | 'redact';

export type ShapeType = 'rect' | 'ellipse' | 'line';

export type PathPoint = {
  x: number;
  y: number;
};

export type OverlayObject = {
  id: string;
  pageIndex: number;
  kind: OverlayKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  /** Kind-specific: text / date / initials content */
  text?: string;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  /** Kind-specific: image / signature raster */
  imageDataUrl?: string;
  /** Kind-specific: freehand draw */
  pathPoints?: PathPoint[];
  /** Kind-specific: geometric shape */
  shapeType?: ShapeType;
  strokeWidth?: number;
  opacity?: number;
  /** Kind-specific: link to a saved signature */
  signatureId?: string;
};

export type FormFieldType =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'date'
  | 'signature';

export type FormFieldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FormField = {
  id: string;
  name: string;
  type: FormFieldType;
  pageIndex: number;
  rect: FormFieldRect;
  value: string;
  options?: string[];
  required?: boolean;
  readOnly?: boolean;
  groupName?: string;
};

export type SmartFillSuggestion = {
  id: string;
  kind: OverlayKind | FormFieldType;
  pageIndex: number;
  rect: FormFieldRect;
  confidence: number;
  label?: string;
  confirmed: boolean;
};

export type DocumentMeta = {
  path: string;
  fileName: string;
  pageCount: number;
  fileSize: number;
  lastModified: number;
};

export type ZoomMode = 'custom' | 'fit-width' | 'fit-page';

export type SaveStatus = 'idle' | 'saving' | 'verifying' | 'saved' | 'error';

export type PageRotation = 0 | 90 | 180 | 270;

export type SearchMatch = {
  pageIndex: number;
  index: number;
  text: string;
};

export type RecentFileEntry = {
  path: string;
  name: string;
  openedAt: number;
};

/**
 * Undo/redo snapshot of editable document state.
 * Captures overlays and form field values (by field id).
 */
export type HistoryEntry = {
  overlays: OverlayObject[];
  formValues: Record<string, string>;
};
