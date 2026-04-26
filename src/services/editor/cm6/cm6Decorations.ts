// Stage 3 batch 8 — CM6 replacement for EditorClassApplier's DOM-mutation
// approach. cledit's class-appliers wrap each tracked range in a <span>
// with a discussion-specific class (e.g. `discussion-editor-highlighting--abc123`)
// so CSS can light it up. CM6 forbids direct DOM manipulation in the
// editor surface, so we use Decoration.mark instead — entries live in a
// StateField, get auto-mapped across every transaction, and render as
// CM6 decorations on the visible viewport.
import {
  StateField, StateEffect, RangeSetBuilder,
} from '@codemirror/state';
import {
  EditorView, Decoration, type DecorationSet,
} from '@codemirror/view';

export interface ClassRangeEntry {
  id: number;
  from: number;
  to: number;
  className: string;
  attrs?: Record<string, string>;
}

export const addClassRangeEffect = StateEffect.define<ClassRangeEntry>();
export const removeClassRangeEffect = StateEffect.define<number>();
export const updateClassRangeEffect = StateEffect.define<{ id: number; from: number; to: number; className: string }>();

let classRangeIdSeq = 0;

interface ClassRangeFieldState {
  entries: readonly ClassRangeEntry[];
  decorations: DecorationSet;
}

function buildDecorations(entries: readonly ClassRangeEntry[], docLen: number): DecorationSet {
  const sorted = entries
    .filter(e => e.from < e.to && e.from >= 0 && e.to <= docLen)
    .slice()
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const e of sorted) {
    builder.add(e.from, e.to, Decoration.mark({
      class: e.className,
      attributes: e.attrs,
    }));
  }
  return builder.finish();
}

export const classRangeField = StateField.define<ClassRangeFieldState>({
  create(state) {
    return { entries: [], decorations: buildDecorations([], state.doc.length) };
  },
  update(value, tr) {
    let entries = value.entries;
    let changed = false;
    if (tr.docChanged) {
      entries = entries.map((e) => {
        const from = tr.changes.mapPos(e.from, 1);
        const to = tr.changes.mapPos(e.to, -1);
        if (from === e.from && to === e.to) return e;
        changed = true;
        return { ...e, from, to };
      }).filter(e => e.from < e.to);
    }
    for (const eff of tr.effects) {
      if (eff.is(addClassRangeEffect)) {
        entries = entries.concat(eff.value);
        changed = true;
      } else if (eff.is(removeClassRangeEffect)) {
        const id = eff.value;
        const next = entries.filter(e => e.id !== id);
        if (next.length !== entries.length) {
          entries = next;
          changed = true;
        }
      } else if (eff.is(updateClassRangeEffect)) {
        const u = eff.value;
        entries = entries.map(e => (e.id === u.id ? { ...e, from: u.from, to: u.to, className: u.className } : e));
        changed = true;
      }
    }
    if (!changed && !tr.docChanged) return value;
    return { entries, decorations: buildDecorations(entries, tr.state.doc.length) };
  },
  provide: f => EditorView.decorations.from(f, (v: ClassRangeFieldState) => v.decorations),
});

export function addClassRange(view: EditorView, from: number, to: number, className: string, attrs?: Record<string, string>): number {
  classRangeIdSeq += 1;
  const id = classRangeIdSeq;
  view.dispatch({ effects: addClassRangeEffect.of({ id, from, to, className, attrs }) });
  return id;
}

export function removeClassRange(view: EditorView, id: number): void {
  view.dispatch({ effects: removeClassRangeEffect.of(id) });
}

export function updateClassRange(view: EditorView, id: number, from: number, to: number, className: string): void {
  view.dispatch({ effects: updateClassRangeEffect.of({ id, from, to, className }) });
}

export function getClassRangeEntries(state: import('@codemirror/state').EditorState): readonly ClassRangeEntry[] {
  const f = state.field(classRangeField, false);
  return f ? f.entries : [];
}
