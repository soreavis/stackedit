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

// Stage 3 batch 11: cm6live flag retired — CM6 is the default editor.
// `isCm6FlagEnabled()` (`?cm6=1`) is kept because Editor.vue still
// exposes a sandbox panel for inspection; the live-mount flag is
// no longer needed.
