export type OcrTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

export interface OcrResult {
  textItems: OcrTextItem[];
  deskewAngle?: number;
}

export type OcrOptions = {
  deskew?: boolean;
};

/**
 * OCR is an optional pack in pdf_editor v1. Always reports unavailable.
 */
export function isOcrAvailable(): false {
  return false;
}

/**
 * Stub OCR entry point. Throws a clear configuration error so callers
 * do not silently assume OCR ran.
 */
export async function runOcr(
  _pageImage: ImageData,
  _opts?: OcrOptions,
): Promise<OcrResult> {
  if (!isOcrAvailable()) {
    throw new Error(
      'OCR not configured in this build — enable optional OCR pack',
    );
  }
  return { textItems: [] };
}
