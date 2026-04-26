import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountCm6Editor } from '../../../src/services/editor/cm6/cm6Editor';
import {
  wrapSelection,
  insertBlock,
  insertText,
  cm6Commands,
  boldCommand,
  italicCommand,
  inlineCodeCommand,
  highlightCommand,
  horizontalRuleCommand,
  strikethroughCommand,
} from '../../../src/services/editor/cm6/cm6Commands';

function mount(doc) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const handle = mountCm6Editor(host, { doc });
  return { handle, host };
}

function setSel(view, anchor, head = anchor) {
  view.dispatch({ selection: { anchor, head } });
}

describe('cm6Commands wrapSelection', () => {
  let host;
  let handle;

  beforeEach(() => { ({ host, handle } = mount('hello world')); });
  afterEach(() => { handle.dispose(); document.body.removeChild(host); });

  it('wraps existing selection with prefix + suffix', () => {
    setSel(handle.view, 0, 5); // select "hello"
    wrapSelection(handle.view, { prefix: '**', placeholder: 'bold' });
    expect(handle.view.state.doc.toString()).toBe('**hello** world');
    const { from, to } = handle.view.state.selection.main;
    expect(handle.view.state.doc.sliceString(from, to)).toBe('hello');
  });

  it('inserts placeholder when no selection', () => {
    setSel(handle.view, 5);
    wrapSelection(handle.view, { prefix: '**', placeholder: 'bold' });
    expect(handle.view.state.doc.toString()).toBe('hello**bold** world');
    // Caret lands inside the wrap (after the prefix + placeholder).
    const main = handle.view.state.selection.main;
    expect(main.anchor).toBe(5 + 2 + 'bold'.length);
    expect(main.head).toBe(main.anchor);
  });

  it('uses prefix as suffix by default', () => {
    setSel(handle.view, 0, 5);
    wrapSelection(handle.view, { prefix: '*' });
    expect(handle.view.state.doc.toString()).toBe('*hello* world');
  });
});

describe('cm6Commands insertBlock padding', () => {
  it('inserts at empty doc with no leading newlines', () => {
    const { handle, host } = mount('');
    setSel(handle.view, 0);
    insertBlock(handle.view, '---');
    expect(handle.view.state.doc.toString()).toBe('---\n');
    handle.dispose();
    document.body.removeChild(host);
  });

  it('pads with two leading newlines when inserting after content', () => {
    const { handle, host } = mount('paragraph');
    setSel(handle.view, 9);
    insertBlock(handle.view, '---');
    expect(handle.view.state.doc.toString()).toBe('paragraph\n\n---\n');
    handle.dispose();
    document.body.removeChild(host);
  });

  it('does not double-pad when blank lines already exist', () => {
    const { handle, host } = mount('paragraph\n\n');
    setSel(handle.view, 11);
    insertBlock(handle.view, '---');
    expect(handle.view.state.doc.toString()).toBe('paragraph\n\n---\n');
    handle.dispose();
    document.body.removeChild(host);
  });

  it('cursor lands at end of inserted block content (before trailing pad)', () => {
    const { handle, host } = mount('lead');
    setSel(handle.view, 4);
    insertBlock(handle.view, '```mermaid\ngraph LR; A-->B\n```');
    const { anchor, head } = handle.view.state.selection.main;
    expect(anchor).toBe(head);
    // 'lead' (4) + leading '\n\n' (2) + block length
    const blockLen = '```mermaid\ngraph LR; A-->B\n```'.length;
    expect(anchor).toBe(4 + 2 + blockLen);
    handle.dispose();
    document.body.removeChild(host);
  });
});

describe('cm6Commands insertText', () => {
  it('inserts at the cursor and advances the caret', () => {
    const { handle, host } = mount('a');
    setSel(handle.view, 1);
    insertText(handle.view, '→');
    expect(handle.view.state.doc.toString()).toBe('a→');
    const { anchor } = handle.view.state.selection.main;
    expect(anchor).toBe(2);
    handle.dispose();
    document.body.removeChild(host);
  });

  it('replaces a selected range', () => {
    const { handle, host } = mount('keep this drop this');
    setSel(handle.view, 10, 19);
    insertText(handle.view, 'X');
    expect(handle.view.state.doc.toString()).toBe('keep this X');
    handle.dispose();
    document.body.removeChild(host);
  });
});

describe('cm6Commands starter set', () => {
  let host;
  let handle;

  beforeEach(() => { ({ host, handle } = mount('hello world')); });
  afterEach(() => { handle.dispose(); document.body.removeChild(host); });

  it('boldCommand wraps with **', () => {
    setSel(handle.view, 0, 5);
    boldCommand(handle.view);
    expect(handle.view.state.doc.toString()).toBe('**hello** world');
  });

  it('italicCommand wraps with _', () => {
    setSel(handle.view, 0, 5);
    italicCommand(handle.view);
    expect(handle.view.state.doc.toString()).toBe('_hello_ world');
  });

  it('inlineCodeCommand wraps with `', () => {
    setSel(handle.view, 0, 5);
    inlineCodeCommand(handle.view);
    expect(handle.view.state.doc.toString()).toBe('`hello` world');
  });

  it('highlightCommand wraps with ==', () => {
    setSel(handle.view, 0, 5);
    highlightCommand(handle.view);
    expect(handle.view.state.doc.toString()).toBe('==hello== world');
  });

  it('strikethroughCommand wraps with ~~', () => {
    setSel(handle.view, 0, 5);
    strikethroughCommand(handle.view);
    expect(handle.view.state.doc.toString()).toBe('~~hello~~ world');
  });

  it('horizontalRuleCommand inserts a padded ---', () => {
    setSel(handle.view, 11);
    horizontalRuleCommand(handle.view);
    expect(handle.view.state.doc.toString()).toBe('hello world\n\n---\n');
  });

  it('cm6Commands registry exposes every starter command by name', () => {
    expect(cm6Commands.bold).toBe(boldCommand);
    expect(cm6Commands.italic).toBe(italicCommand);
    expect(cm6Commands.inlineCode).toBe(inlineCodeCommand);
    expect(cm6Commands.highlight).toBe(highlightCommand);
    expect(cm6Commands.strikethrough).toBe(strikethroughCommand);
    expect(cm6Commands.horizontalRule).toBe(horizontalRuleCommand);
    expect(cm6Commands.subscript).toBeTypeOf('function');
    expect(cm6Commands.superscript).toBeTypeOf('function');
  });
});
