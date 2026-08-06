/**
 * PDF password unlock / protect helpers.
 *
 * LIMITATION (pdf-lib 1.17.x):
 * - `PDFDocument.load` supports `ignoreEncryption` but has **no** `password` option.
 * - There is **no** `doc.encrypt({ userPassword, ownerPassword })` API in this version.
 * - True AES/RC4 password encryption cannot be written with stock pdf-lib.
 *
 * What we implement:
 * - `unlockPdf`: reload with `ignoreEncryption: true` and re-save, which strips
 *   encryption from documents pdf-lib can parse. The `password` argument is
 *   accepted for API stability; when the document reports encryption and an
 *   empty password is supplied we throw. Callers should treat this as a
 *   best-effort strip, not a password validator.
 * - `protectPdf`: throws a clear error documenting the missing encrypt API.
 */

import { PDFDocument } from 'pdf-lib';

export async function unlockPdf(
  bytes: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  // pdf-lib cannot verify the user password. Require a non-empty password when
  // the source is encrypted so the UI flow still asks for one.
  if (doc.isEncrypted && password.length === 0) {
    throw new Error('Password required to unlock this PDF');
  }

  // Re-saving without encryption produces an unprotected copy when load succeeded.
  return doc.save({ useObjectStreams: true });
}

/**
 * Attempt to password-protect a PDF.
 *
 * @throws Always in this build — pdf-lib has no encrypt API. See file header.
 */
export async function protectPdf(
  bytes: Uint8Array,
  userPassword: string,
  ownerPassword?: string,
): Promise<Uint8Array> {
  void bytes;
  void ownerPassword;
  if (!userPassword) {
    throw new Error('User password is required');
  }

  // Desired API (not available in pdf-lib 1.17.x):
  //   const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  //   doc.encrypt({ userPassword, ownerPassword: ownerPassword ?? userPassword });
  //   return doc.save();
  throw new Error(
    'Password protection is not supported: pdf-lib 1.17.x has no encrypt() API. ' +
      'Use an external tool (e.g. qpdf) or a future pdf-lib release that adds encryption.',
  );
}
