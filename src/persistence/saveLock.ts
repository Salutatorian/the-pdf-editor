/**
 * Serialize all disk saves (autosave + Save + Save As) so they cannot
 * interleave on the same temp/original path.
 */

let chain: Promise<unknown> = Promise.resolve();

export function withSaveLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
