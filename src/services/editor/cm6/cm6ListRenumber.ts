// Stage 3 regression fix — port of cledit `keystrokes.ts fixNumberedList`
// to CM6's keymap surface. When the user Tab-indents (or Shift+Tab
// dedents) an ordered-list line, the surrounding contiguous numbered
// list at the relevant indent level gets renumbered so the editor view
// matches what markdown-it would render. Without this, indenting `2.`
// out of a list leaves `1. / 3.` in the source — markdown-it auto-
// numbers at render time so the output is fine, but diffs over
// hand-edited markdown look noisy.
//
// Behavior is deliberately narrow: only triggers when a Tab/Shift-Tab
// keystroke lands on a line whose first non-whitespace token is
// `<digits>.<space>`. Multi-line selections, mixed list/non-list
// regions, and other edge cases fall through to CM6's default Tab
// handler.
import type { ChangeSpec } from '@codemirror/state';
import type { EditorView, Command } from '@codemirror/view';
import { indentMore, indentLess } from '@codemirror/commands';

const ORDERED_PREFIX = /^(\s*)(\d+)(\.\s)/;

interface OrderedRun {
  indent: string;
  startLine: number; // 1-indexed (CM6 convention)
  endLine: number; // inclusive
}

// True when `text` is "deeper" than `indent` — a sub-list line or a
// continuation paragraph indented under a parent list item.
function startsWithMoreIndent(text: string, indent: string): boolean {
  if (text === '' || /^\s*$/.test(text)) return false;
  if (text.length <= indent.length) return false;
  if (!text.startsWith(indent)) return false;
  return /^\s/.test(text[indent.length]);
}

// Walk outward from `lineNum` to find the block of ordered-list lines
// at the same indent — extending past lines that are MORE indented (sub-
// lists / continuation paragraphs) but breaking on:
//   - blank lines (terminate the list)
//   - lines at less indent
//   - lines at the same indent that are NOT ordered list items
function findOrderedRun(view: EditorView, lineNum: number): OrderedRun | null {
  const doc = view.state.doc;
  const startMatch = ORDERED_PREFIX.exec(doc.line(lineNum).text);
  if (!startMatch) return null;
  const indent = startMatch[1];

  let startLine = lineNum;
  while (startLine > 1) {
    const prev = doc.line(startLine - 1);
    const m = ORDERED_PREFIX.exec(prev.text);
    if (m && m[1] === indent) {
      startLine -= 1;
      continue;
    }
    if (startsWithMoreIndent(prev.text, indent)) {
      startLine -= 1;
      continue;
    }
    break;
  }

  let endLine = lineNum;
  while (endLine < doc.lines) {
    const next = doc.line(endLine + 1);
    const m = ORDERED_PREFIX.exec(next.text);
    if (m && m[1] === indent) {
      endLine += 1;
      continue;
    }
    if (startsWithMoreIndent(next.text, indent)) {
      endLine += 1;
      continue;
    }
    break;
  }
  return { indent, startLine, endLine };
}

// Build one transaction's worth of ChangeSpecs that rewrites the
// `<digits>` portion of every line in the run to a contiguous sequence
// starting from the first line's existing number (so the user's choice
// of starting point is preserved).
function buildRenumberChanges(view: EditorView, run: OrderedRun): ChangeSpec[] {
  const doc = view.state.doc;
  const firstMatch = ORDERED_PREFIX.exec(doc.line(run.startLine).text);
  if (!firstMatch) return [];
  let n = parseInt(firstMatch[2], 10);
  const changes: ChangeSpec[] = [];
  for (let l = run.startLine; l <= run.endLine; l += 1) {
    const line = doc.line(l);
    const m = ORDERED_PREFIX.exec(line.text);
    // Only renumber lines that are themselves ordered-list items at
    // THIS run's indent. Sub-list lines + continuation paragraphs swept
    // up by findOrderedRun stay untouched.
    if (!m || m[1] !== run.indent) continue;
    const expected = String(n);
    if (m[2] !== expected) {
      const numStart = line.from + m[1].length;
      changes.push({ from: numStart, to: numStart + m[2].length, insert: expected });
    }
    n += 1;
  }
  return changes;
}

// Find every distinct ordered-list run that contains any of the given
// line numbers. Used after a Tab/Shift+Tab to renumber both the run
// the cursor used to belong to (now potentially shorter / re-numbered)
// and the run it newly belongs to (now potentially longer).
function collectAffectedRuns(view: EditorView, lineNums: ReadonlySet<number>): OrderedRun[] {
  const seen = new Set<string>();
  const runs: OrderedRun[] = [];
  for (const ln of lineNums) {
    const run = findOrderedRun(view, ln);
    if (!run) continue;
    const key = `${run.startLine}:${run.endLine}:${run.indent}`;
    if (seen.has(key)) continue;
    seen.add(key);
    runs.push(run);
  }
  return runs;
}

// Snapshot the cursor lines + the lines immediately above/below so we
// can re-find the run after the indent change shifts content around.
function affectedLineSet(view: EditorView): Set<number> {
  const set = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const fromLine = view.state.doc.lineAt(range.from).number;
    const toLine = view.state.doc.lineAt(range.to).number;
    for (let l = Math.max(1, fromLine - 1); l <= Math.min(view.state.doc.lines, toLine + 1); l += 1) {
      set.add(l);
    }
  }
  return set;
}

function renumberAround(view: EditorView, candidateLines: Set<number>): boolean {
  const runs = collectAffectedRuns(view, candidateLines);
  if (!runs.length) return false;
  const changes: ChangeSpec[] = [];
  for (const run of runs) changes.push(...buildRenumberChanges(view, run));
  if (!changes.length) return false;
  view.dispatch({ changes });
  return true;
}

// Cm6 keymap entry — Tab. Defers to `indentMore` for the actual
// indent transition, then renumbers the affected runs in a follow-up
// transaction. Returns false (so other Tab handlers can run) when the
// cursor isn't anywhere near a numbered-list line.
export const tabRenumberCommand: Command = (view) => {
  const before = affectedLineSet(view);
  const wasOrdered = Array.from(before).some(ln => ORDERED_PREFIX.test(view.state.doc.line(ln).text));
  if (!wasOrdered) return false;
  if (!indentMore(view)) return false;
  // The selection (and the line numbers we recorded) may have shifted
  // by one after indentMore. Re-snapshot.
  const after = affectedLineSet(view);
  for (const ln of before) after.add(Math.min(view.state.doc.lines, Math.max(1, ln)));
  renumberAround(view, after);
  return true;
};

export const shiftTabRenumberCommand: Command = (view) => {
  const before = affectedLineSet(view);
  const wasOrdered = Array.from(before).some(ln => ORDERED_PREFIX.test(view.state.doc.line(ln).text));
  if (!wasOrdered) return false;
  if (!indentLess(view)) return false;
  const after = affectedLineSet(view);
  for (const ln of before) after.add(Math.min(view.state.doc.lines, Math.max(1, ln)));
  renumberAround(view, after);
  return true;
};

// Helpers exported for unit tests + composability.
export {
  findOrderedRun, buildRenumberChanges, renumberAround,
  ORDERED_PREFIX,
};
