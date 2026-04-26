// Stage 3 batch 3 — CM6 marker bridge.
//
// cledit's `Marker { offset, trailing, adjustOffset(diffs) }` lets discussion
// gutters and find/replace track positions across edits. Each diff-match-patch
// transaction calls `adjustOffset(diffs)` on every marker so the offset stays
// pointed at the same logical character.
//
// CM6's equivalent is a `StateField` whose entries auto-map across every
// transaction via `tr.changes.mapPos(offset, assoc)`. The `trailing` semantic
// maps to the assoc bias:
//   - non-trailing (cledit default): inserts AT the marker push it forward → assoc=1
//   - trailing: inserts AT the marker leave it where it was → assoc=-1
//
// Future batches will:
//   - bridge editorSvcDiscussions to call addMarker / removeMarker against this
//     field instead of cledit's marker map (batches 3b/4).
//   - render Decoration.mark over [startMarker.offset, endMarker.offset] for
//     discussion + find-match highlighting (batches 4/5).
import { StateField, StateEffect } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export interface MarkerEntry {
  id: number;
  offset: number;
  trailing: boolean;
}

let idCounter = 0;

export const addMarkerEffect = StateEffect.define<MarkerEntry>();
export const removeMarkerEffect = StateEffect.define<number>();

export const markerField = StateField.define<readonly MarkerEntry[]>({
  create: () => [],
  update(markers, tr) {
    let next: readonly MarkerEntry[] = markers;
    if (tr.docChanged) {
      next = next.map((m) => {
        const newOffset = tr.changes.mapPos(m.offset, m.trailing ? -1 : 1);
        return newOffset === m.offset ? m : { ...m, offset: newOffset };
      });
    }
    for (const e of tr.effects) {
      if (e.is(addMarkerEffect)) {
        next = next.concat(e.value);
      } else if (e.is(removeMarkerEffect)) {
        const id = e.value;
        next = next.filter((m) => m.id !== id);
      }
    }
    return next;
  },
});

export function addMarker(view: EditorView, offset: number, trailing = false): number {
  idCounter += 1;
  const id = idCounter;
  view.dispatch({ effects: addMarkerEffect.of({ id, offset, trailing }) });
  return id;
}

export function removeMarker(view: EditorView, id: number): void {
  view.dispatch({ effects: removeMarkerEffect.of(id) });
}

export function getMarkers(state: EditorState): readonly MarkerEntry[] {
  return state.field(markerField, false) || [];
}

export function getMarkerOffset(state: EditorState, id: number): number | null {
  const m = getMarkers(state).find((x) => x.id === id);
  return m ? m.offset : null;
}
