// Stage 3 batch 3 — selection helpers mirroring cledit's selectionMgr API.
//
// cledit exposes `clEditor.selectionMgr.{selectionStart, selectionEnd, hasFocus()}`
// plus `clEditor.selectionMgr.setSelectionStartEnd(start, end)`. The CM6
// equivalent goes through `EditorView.state.selection.main` and
// `EditorView.dispatch({ selection })`. This module wraps that so consumers
// (find/replace, comment gutter, toolbar commands) can swap to the new
// editor in batches 4 / 5 without each rewriting the same boilerplate.
import type { EditorView } from '@codemirror/view';

export interface SelectionRange {
  start: number;
  end: number;
}

export function getSelection(view: EditorView): SelectionRange {
  const { from, to } = view.state.selection.main;
  return { start: from, end: to };
}

export function setSelection(view: EditorView, range: SelectionRange): void {
  view.dispatch({ selection: { anchor: range.start, head: range.end } });
}

export function hasFocus(view: EditorView): boolean {
  return view.hasFocus;
}

export function focusEditor(view: EditorView): void {
  view.focus();
}
