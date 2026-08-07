/**
 * Hold PDF bytes outside Immer drafts. Zustand+Immer can proxy/freeze
 * TypedArrays and break pdf.js after open/recent reload.
 */
let heldBytes: Uint8Array | null = null;
let heldGen = 0;

export function setHeldDocumentBytes(bytes: Uint8Array | null): number {
  heldBytes = bytes ? bytes.slice() : null;
  heldGen += 1;
  return heldGen;
}

export function getHeldDocumentBytes(): Uint8Array | null {
  return heldBytes;
}

export function getHeldDocumentGen(): number {
  return heldGen;
}
