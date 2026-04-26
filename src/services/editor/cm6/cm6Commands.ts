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

// Replace the lines covered by the current selection (or the cursor's
// home line) with mapper(block). Mirrors customToolbarButtons.js
// transformLines — used by sort-lines and (via mapper) by callout.
export function transformLines(view: EditorView, mapper: (block: string) => string): boolean {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc.toString();
  const lineStart = doc.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
  let lineEnd = doc.indexOf('\n', to);
  if (lineEnd === -1) lineEnd = doc.length;
  const block = doc.slice(lineStart, lineEnd);
  const transformed = mapper(block);
  view.dispatch({ changes: { from: lineStart, to: lineEnd, insert: transformed } });
  return true;
}

// Replace the current selection with fn(selection). No-op without a
// selection (these are user-driven transforms, not at-cursor inserts).
export function transformSelection(view: EditorView, fn: (s: string) => string): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) return false;
  const selected = view.state.doc.sliceString(from, to);
  const replacement = fn(selected);
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from, head: from + replacement.length },
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

// ---------- batch 4b: long-tail commands ----------

// Math: inline ($x$) when something is selected, block ($$ … $$) otherwise.
export const mathCommand: Cm6Command = (view) => {
  const { from, to } = view.state.selection.main;
  if (from !== to) return wrapSelection(view, { prefix: '$', placeholder: 'x^2' });
  return insertBlock(view, '$$\nE = mc^2\n$$');
};

// Mermaid: selected text becomes the label of a single flowchart node.
export const mermaidCommand: Cm6Command = (view) => {
  const { from, to } = view.state.selection.main;
  const selected = view.state.doc.sliceString(from, to);
  const label = selected.replace(/\s+/g, ' ').replace(/"/g, '\\"').trim();
  const body = label ? `flowchart LR\n  A["${label}"]` : 'flowchart LR\n  A --> B';
  return insertBlock(view, `\`\`\`mermaid\n${body}\n\`\`\``);
};

// Music notation (ABC): selected text becomes the title.
export const musicCommand: Cm6Command = (view) => {
  const { from, to } = view.state.selection.main;
  const selected = view.state.doc.sliceString(from, to);
  const title = selected.replace(/\s+/g, ' ').trim() || 'Untitled';
  return insertBlock(
    view,
    `\`\`\`abc\nX:1\nT:${title}\nM:4/4\nL:1/4\nK:C\n| C D E F | G A B c |\n\`\`\``,
  );
};

export type CalloutType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';

export function calloutCommand(type: CalloutType): Cm6Command {
  return (view) => {
    const { from, to } = view.state.selection.main;
    const selected = view.state.doc.sliceString(from, to);
    const body = selected
      ? selected.split('\n').map(l => `> ${l}`).join('\n')
      : `> ${type.toLowerCase()} body`;
    return insertBlock(view, `> [!${type}]\n${body}`);
  };
}

export const calloutNoteCommand = calloutCommand('NOTE');
export const calloutTipCommand = calloutCommand('TIP');
export const calloutImportantCommand = calloutCommand('IMPORTANT');
export const calloutWarningCommand = calloutCommand('WARNING');
export const calloutCautionCommand = calloutCommand('CAUTION');

// Date/time inserts — same ISO format the existing toolbar uses.
function pad2(n: number): string { return String(n).padStart(2, '0'); }
function isoDate(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function isoTime(d: Date): string { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

export const dateCommand: Cm6Command = view => insertText(view, isoDate(new Date()));
export const dateTimeCommand: Cm6Command = (view) => {
  const d = new Date();
  return insertText(view, `${isoDate(d)} ${isoTime(d)}`);
};
export const timeCommand: Cm6Command = view => insertText(view, isoTime(new Date()));

// YAML front-matter stub at document start. No-op when the doc already
// starts with `---` so re-clicking doesn't double-stamp.
export const frontmatterCommand: Cm6Command = (view) => {
  const doc = view.state.doc.toString();
  if (doc.split('\n')[0].trim() === '---') return false;
  const stub = `---\ntitle: \nauthor: \ndate: ${isoDate(new Date())}\ntags: []\n---\n\n`;
  const caret = stub.indexOf('title: ') + 'title: '.length;
  view.dispatch({
    changes: { from: 0, to: 0, insert: stub },
    selection: { anchor: caret, head: caret },
  });
  return true;
};

// Case-convert family.
export const upperCaseCommand: Cm6Command = view => transformSelection(view, s => s.toUpperCase());
export const lowerCaseCommand: Cm6Command = view => transformSelection(view, s => s.toLowerCase());
export const titleCaseCommand: Cm6Command = view => transformSelection(view, s =>
  s.replace(/\b([a-z])/g, c => c.toUpperCase()));
export const sentenceCaseCommand: Cm6Command = view => transformSelection(view, (s) => {
  const lower = s.toLowerCase();
  return lower.replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix, c) => prefix + c.toUpperCase());
});
export const snakeCaseCommand: Cm6Command = view => transformSelection(view, s =>
  s.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^\w]/g, ''));
export const kebabCaseCommand: Cm6Command = view => transformSelection(view, s =>
  s.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, ''));

// Sort lines alphabetically (locale-aware).
export const sortLinesCommand: Cm6Command = view => transformLines(view, (block) => {
  const lines = block.split('\n');
  return lines.slice().sort((a, b) => a.localeCompare(b)).join('\n');
});

export const SPECIAL_CHARS: ReadonlyArray<readonly [string, string]> = [
  ['—', 'Em dash'], ['–', 'En dash'], ['…', 'Ellipsis'],
  ['“', 'Open curly quote'], ['”', 'Close curly quote'],
  ['‘', 'Open curly apostrophe'], ['’', 'Close curly apostrophe'],
  ['→', 'Right arrow'], ['←', 'Left arrow'], ['↔', 'Both arrows'],
  ['•', 'Bullet'], ['©', 'Copyright'], ['®', 'Registered'], ['™', 'Trademark'],
  ['½', 'One half'], ['¼', 'One quarter'], ['¾', 'Three quarters'],
  ['×', 'Times'], ['÷', 'Divide'], ['±', 'Plus-minus'],
  ['≈', 'Approx'], ['≠', 'Not equal'], ['≤', 'Less or equal'], ['≥', 'Greater or equal'],
];

export function specialCharCommand(char: string): Cm6Command {
  return view => insertText(view, char);
}

// Wiki-style [[Page Name]] link.
export const wikiLinkCommand: Cm6Command = view =>
  wrapSelection(view, { prefix: '[[', suffix: ']]', placeholder: 'Page Name' });

// Image with markdown-it-imsize dimensions.
export const imageWithSizeCommand: Cm6Command = (view) => {
  const { from, to } = view.state.selection.main;
  const selected = view.state.doc.sliceString(from, to);
  const alt = selected || 'alt text';
  return insertText(view, `![${alt}](https://example.com/image.png =300x)`);
};

// Build a markdown table of `rows × cols` with header + separator + body.
export function buildTable(rows: number, cols: number): string {
  const header = `| ${Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(' | ')} |`;
  const sep = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
  const body = Array.from({ length: rows - 1 }, () =>
    `| ${Array.from({ length: cols }, () => '   ').join(' | ')} |`).join('\n');
  return body ? `${header}\n${sep}\n${body}` : `${header}\n${sep}`;
}

export function tableInsertCommand(rows: number, cols: number): Cm6Command {
  return view => insertBlock(view, buildTable(rows, cols));
}

export const table2x2Command = tableInsertCommand(2, 2);
export const table3x3Command = tableInsertCommand(3, 3);
export const table4x3Command = tableInsertCommand(4, 3);
export const table5x4Command = tableInsertCommand(5, 4);
export const table10x4Command = tableInsertCommand(10, 4);

// ---------- batch 10: pagedown-equivalent commands ----------

// Prefix every line of the current selection (or the cursor's home line)
// with a generated prefix. `prefix(i, total)` is called per line index.
export function prefixLines(view: EditorView, prefix: (i: number, total: number) => string): boolean {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc.toString();
  const lineStart = doc.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
  let lineEnd = doc.indexOf('\n', to);
  if (lineEnd === -1) lineEnd = doc.length;
  const block = doc.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const transformed = lines.map((line, i) => prefix(i, lines.length) + line).join('\n');
  view.dispatch({ changes: { from: lineStart, to: lineEnd, insert: transformed } });
  return true;
}

export const ulistCommand: Cm6Command = view => prefixLines(view, () => '- ');
export const olistCommand: Cm6Command = view => prefixLines(view, i => `${i + 1}. `);
export const clistCommand: Cm6Command = view => prefixLines(view, () => '- [ ] ');
export const quoteCommand: Cm6Command = view => prefixLines(view, () => '> ');

// Code: when nothing is selected, insert an inline backtick wrap; with
// a selection that spans multiple lines, fence with ``` instead.
export const codeCommand: Cm6Command = (view) => {
  const { from, to } = view.state.selection.main;
  const selected = view.state.doc.sliceString(from, to);
  if (!selected) {
    return wrapSelection(view, { prefix: '`', placeholder: 'code' });
  }
  if (selected.includes('\n')) {
    return insertBlock(view, `\`\`\`\n${selected}\n\`\`\``);
  }
  return wrapSelection(view, { prefix: '`' });
};

// Heading: replace the line's leading hashes with `#`.repeat(level).
export function headingCommand(level: number): Cm6Command {
  return (view) => {
    const { from, to } = view.state.selection.main;
    const doc = view.state.doc.toString();
    const lineStart = doc.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
    let lineEnd = doc.indexOf('\n', to);
    if (lineEnd === -1) lineEnd = doc.length;
    const lineText = doc.slice(lineStart, lineEnd);
    const stripped = lineText.replace(/^#{1,6}\s+/, '');
    const newLine = `${'#'.repeat(level)} ${stripped}`;
    view.dispatch({ changes: { from: lineStart, to: lineEnd, insert: newLine } });
    return true;
  };
}

export const heading1Command = headingCommand(1);
export const heading2Command = headingCommand(2);
export const heading3Command = headingCommand(3);
export const heading4Command = headingCommand(4);
export const heading5Command = headingCommand(5);
export const heading6Command = headingCommand(6);

// Link / image — open the corresponding modal, insert the result at the
// captured selection. The link/image modals call `callback(url | null)`
// with just a URL string, matching the existing pagedown hooks contract.
type ModalOpener = (cb: (url: string | null) => void) => void;

export function linkCommand(openModal: ModalOpener): Cm6Command {
  return (view) => {
    const { from, to } = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(from, to) || 'link';
    openModal((url) => {
      if (!url) return;
      view.dispatch({
        changes: { from, to, insert: `[${selectedText}](${url})` },
      });
    });
    return true;
  };
}

export function imageCommand(openModal: ModalOpener): Cm6Command {
  return (view) => {
    const { from, to } = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(from, to) || 'alt text';
    openModal((url) => {
      if (!url) return;
      view.dispatch({
        changes: { from, to, insert: `![${selectedText}](${url})` },
      });
    });
    return true;
  };
}

export const cm6Commands: Record<string, Cm6Command> = {
  bold: boldCommand,
  italic: italicCommand,
  inlineCode: inlineCodeCommand,
  highlight: highlightCommand,
  subscript: subscriptCommand,
  superscript: superscriptCommand,
  strikethrough: strikethroughCommand,
  horizontalRule: horizontalRuleCommand,
  math: mathCommand,
  mermaid: mermaidCommand,
  music: musicCommand,
  calloutNote: calloutNoteCommand,
  calloutTip: calloutTipCommand,
  calloutImportant: calloutImportantCommand,
  calloutWarning: calloutWarningCommand,
  calloutCaution: calloutCautionCommand,
  date: dateCommand,
  dateTime: dateTimeCommand,
  time: timeCommand,
  frontmatter: frontmatterCommand,
  upperCase: upperCaseCommand,
  lowerCase: lowerCaseCommand,
  titleCase: titleCaseCommand,
  sentenceCase: sentenceCaseCommand,
  snakeCase: snakeCaseCommand,
  kebabCase: kebabCaseCommand,
  sortLines: sortLinesCommand,
  wikiLink: wikiLinkCommand,
  imageWithSize: imageWithSizeCommand,
  table2x2: table2x2Command,
  table3x3: table3x3Command,
  table4x3: table4x3Command,
  table5x4: table5x4Command,
  table10x4: table10x4Command,
  // batch 10 — pagedown equivalents
  ulist: ulistCommand,
  olist: olistCommand,
  clist: clistCommand,
  quote: quoteCommand,
  code: codeCommand,
  heading1: heading1Command,
  heading2: heading2Command,
  heading3: heading3Command,
  heading4: heading4Command,
  heading5: heading5Command,
  heading6: heading6Command,
};
