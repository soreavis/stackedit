// Stage 3 batch 11 — `Cm6Marker` extracted to its own module so stores
// (`content.js`) and components (`FindReplace.vue`) can import the
// class without dragging in cm6ClEditorBridge's @codemirror/* tree
// (which would inflate the main bundle past the 200 kB size-limit).
//
// The class is intentionally a plain data holder with id management
// — actual offset mapping is done by the bridge's `markerField`
// StateField, which mirrors offsets back to instances on every
// transaction (see cm6ClEditorBridge's edit listener).

let markerSeq = 0;

export class Cm6Marker {
  id: number;
  offset: number;
  trailing: boolean;

  constructor(offset: number, trailing = false) {
    markerSeq += 1;
    this.id = markerSeq;
    this.offset = offset;
    this.trailing = trailing;
  }

  // No-op kept so any leftover call site that does
  // `marker.adjustOffset(diffs)` (cledit's API) survives. The
  // StateField does the real mapping via tr.changes.mapPos().
  adjustOffset(_diffs: Array<[number, string]>): void { /* StateField handles it */ }
}
