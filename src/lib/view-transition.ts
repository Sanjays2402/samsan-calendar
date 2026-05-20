/**
 * Wrap a state mutation in document.startViewTransition when supported.
 * Falls back to a plain call otherwise.
 */
export function withViewTransition(fn: () => void): void {
  type StartFn = (cb: () => void) => unknown;
  const doc = document as Document & { startViewTransition?: StartFn };
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(fn);
  } else {
    fn();
  }
}
