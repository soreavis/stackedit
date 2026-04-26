// Stage 3 batch 4a — CM6 toolbar command primitives + a representative
// set of commands. Cledit's `customToolbarButtons.js` registers 37+
// `action(editorSvc)` callbacks that read selection / replace text via
// `clEditor.selectionMgr` + `clEditor.replace`. Two patterns dominate:
//
//   - wrap(editorSvc, prefix, suffix, placeholder) — wrap selection or
//     insert a placeholder.
//   - insertBlock(editorSvc, block) — insert a multi-line block with
//     proper blank-line padding.
//
// This module ports those primitives to CM6's `(view: EditorView) => boolean`
// command shape, plus a starter set of commands so the registry pattern
// is in place. Batch 4b will fill in the long tail (callouts, dropdowns,
// dates, frontmatter, case-convert, etc.). Batch 6 will rewire
// NavigationBar.vue and shortcuts.ts to call these against the CM6 view
// instead of cledit.
import type { EditorView } from '@codemirror/view';

export type Cm6Command = (view: EditorView) => boolean;

export interface WrapOptions {
  prefix: string;
  suffix?: string;
  placeholder?: string;
}

export function wrapSelection(view: EditorView, options: WrapOptions): boolean {
  const { prefix } = options;
  const suffix = options.suffix ?? prefix;
  const placeholder = options.placeholder ?? '';
  const { from, to } = view.state.selection.main;
  const selected = view.state.doc.sliceString(from, to);
  const inner = selected || placeholder;
  const replacement = `${prefix}${inner}${suffix}`;

  const newSelection = selected
    ? { anchor: from + prefix.length, head: from + prefix.length + inner.length }
    : (() => {
      const caret = from + prefix.length + placeholder.length;
      return { anchor: caret, head: caret };
    })();

  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: newSelection,
  });
  return true;
}

// Compute leading/trailing newlines so a block insert ends up surrounded
// by exactly one blank line above and below. Mirrors customToolbarButtons.js
// `padForBlock`.
function padForBlock(doc: string, start: number, end: number) {
  let preNL = 0;
  while (preNL < 2 && start - preNL - 1 >= 0 && doc[start - preNL - 1] === '\n') preNL += 1;
  let postNL = 0;
  while (postNL < 2 && doc[end + postNL] === '\n') postNL += 1;
  const atDocStart = start === 0;
  const atDocEnd = end === doc.length;
  const leadingPad = atDocStart ? '' : '\n'.repeat(Math.max(2 - preNL, 0));
  const targetPostNL = atDocEnd ? 1 : 2;
  const trailingPad = '\n'.repeat(Math.max(targetPostNL - postNL, 0));
  return { leadingPad, trailingPad };
}

export function insertBlock(view: EditorView, block: string): boolean {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc.toString();
  const { leadingPad, trailingPad } = padForBlock(doc, from, to);
  const replacement = `${leadingPad}${block}${trailingPad}`;
  const caret = from + leadingPad.length + block.length;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: caret, head: caret },
  });
  return true;
}

// Insert plain text at the cursor (or replace the current selection).
// Used for 'special character' / 'insert date' style commands.
export function insertText(view: EditorView, text: string): boolean {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length, head: from + text.length },
  });
  return true;
}

// Starter command set — wave-1 inline wraps + horizontal rule + the two
// foundational pagedown wraps (bold, italic). Long tail in batch 4b.
export const boldCommand: Cm6Command = view => wrapSelection(view, { prefix: '**', placeholder: 'bold' });
export const italicCommand: Cm6Command = view => wrapSelection(view, { prefix: '_', placeholder: 'italic' });
export const inlineCodeCommand: Cm6Command = view => wrapSelection(view, { prefix: '`', placeholder: 'code' });
export const highlightCommand: Cm6Command = view => wrapSelection(view, { prefix: '==', placeholder: 'highlighted' });
export const subscriptCommand: Cm6Command = view => wrapSelection(view, { prefix: '~', placeholder: '2' });
export const superscriptCommand: Cm6Command = view => wrapSelection(view, { prefix: '^', placeholder: '2' });
export const strikethroughCommand: Cm6Command = view => wrapSelection(view, { prefix: '~~', placeholder: 'strikethrough' });
export const horizontalRuleCommand: Cm6Command = view => insertBlock(view, '---');

export const cm6Commands: Record<string, Cm6Command> = {
  bold: boldCommand,
  italic: italicCommand,
  inlineCode: inlineCodeCommand,
  highlight: highlightCommand,
  subscript: subscriptCommand,
  superscript: superscriptCommand,
  strikethrough: strikethroughCommand,
  horizontalRule: horizontalRuleCommand,
};
