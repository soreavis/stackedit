// Tiny standalone helper so callers (Editor.vue) can read the flag
// without statically importing the heavy CM6 module — that would defeat
// the dynamic import() that keeps CM6 out of the main bundle.
export function isCm6FlagEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has('cm6');
  } catch {
    return false;
  }
}
