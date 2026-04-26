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

// Stage 3 batch 6 flag — when set, the CM6 bridge replaces cledit as the
// LIVE editor (driving the preview, content store, discussions). The
// `?cm6=1` sandbox flag stays separate; cm6live is the integration test.
export function isCm6LiveFlagEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has('cm6live');
  } catch {
    return false;
  }
}
