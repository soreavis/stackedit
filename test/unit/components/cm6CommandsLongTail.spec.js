import { describe, it, expect } from 'vitest';
import { mountCm6Editor } from '../../../src/services/editor/cm6/cm6Editor';
import {
  mathCommand,
  mermaidCommand,
  musicCommand,
  calloutNoteCommand,
  calloutTipCommand,
  calloutCautionCommand,
  dateCommand,
  dateTimeCommand,
  timeCommand,
  frontmatterCommand,
  upperCaseCommand,
  lowerCaseCommand,
  titleCaseCommand,
  sentenceCaseCommand,
  snakeCaseCommand,
  kebabCaseCommand,
  sortLinesCommand,
  wikiLinkCommand,
  imageWithSizeCommand,
  buildTable,
  table2x2Command,
  table3x3Command,
  table5x4Command,
  table10x4Command,
  SPECIAL_CHARS,
  specialCharCommand,
  cm6Commands,
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

function disposeMount({ handle, host }) {
  handle.dispose();
  document.body.removeChild(host);
}

describe('cm6Commands math/mermaid/music', () => {
  it('mathCommand wraps inline when selection present', () => {
    const m = mount('a x b');
    setSel(m.handle.view, 2, 3);
    mathCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('a $x$ b');
    disposeMount(m);
  });

  it('mathCommand inserts a $$ block when no selection', () => {
    const m = mount('lead');
    setSel(m.handle.view, 4);
    mathCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toContain('$$\nE = mc^2\n$$');
    disposeMount(m);
  });

  it('mermaidCommand wraps selection as a labeled node', () => {
    const m = mount('lead my topic');
    setSel(m.handle.view, 5, 13);
    mermaidCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toContain('A["my topic"]');
    disposeMount(m);
  });

  it('mermaidCommand uses default A->B when no selection', () => {
    const m = mount('lead');
    setSel(m.handle.view, 4);
    mermaidCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toContain('A --> B');
    disposeMount(m);
  });

  it('musicCommand uses selection as ABC title', () => {
    const m = mount('lead My Song');
    setSel(m.handle.view, 5, 12);
    musicCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toContain('T:My Song');
    disposeMount(m);
  });

  it('musicCommand defaults to Untitled when no selection', () => {
    const m = mount('');
    musicCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toContain('T:Untitled');
    disposeMount(m);
  });
});

describe('cm6Commands callouts', () => {
  it('calloutNoteCommand inserts > [!NOTE]', () => {
    const m = mount('');
    calloutNoteCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toContain('> [!NOTE]');
    disposeMount(m);
  });

  it('calloutTipCommand prefixes selected lines with > ', () => {
    const m = mount('hello\nworld');
    setSel(m.handle.view, 0, 11);
    calloutTipCommand(m.handle.view);
    const doc = m.handle.view.state.doc.toString();
    expect(doc).toContain('> [!TIP]');
    expect(doc).toContain('> hello');
    expect(doc).toContain('> world');
    disposeMount(m);
  });

  it('calloutCautionCommand uses CAUTION type', () => {
    const m = mount('');
    calloutCautionCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toContain('> [!CAUTION]');
    disposeMount(m);
  });
});

describe('cm6Commands date/time/frontmatter', () => {
  it('dateCommand inserts an ISO date', () => {
    const m = mount('');
    dateCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    disposeMount(m);
  });

  it('dateTimeCommand inserts ISO date + HH:mm', () => {
    const m = mount('');
    dateTimeCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    disposeMount(m);
  });

  it('timeCommand inserts HH:mm', () => {
    const m = mount('');
    timeCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toMatch(/^\d{2}:\d{2}$/);
    disposeMount(m);
  });

  it('frontmatterCommand inserts YAML stub at doc start with cursor on title', () => {
    const m = mount('content');
    frontmatterCommand(m.handle.view);
    const doc = m.handle.view.state.doc.toString();
    expect(doc.startsWith('---\ntitle: \nauthor: \ndate: ')).toBe(true);
    expect(doc.endsWith('content')).toBe(true);
    const { anchor, head } = m.handle.view.state.selection.main;
    expect(anchor).toBe(head);
    expect(doc.slice(0, anchor)).toContain('title: ');
    disposeMount(m);
  });

  it('frontmatterCommand is a no-op when doc starts with ---', () => {
    const m = mount('---\nexisting\n---\n');
    const before = m.handle.view.state.doc.toString();
    const result = frontmatterCommand(m.handle.view);
    expect(result).toBe(false);
    expect(m.handle.view.state.doc.toString()).toBe(before);
    disposeMount(m);
  });
});

describe('cm6Commands case-convert', () => {
  it.each([
    [upperCaseCommand, 'hello world', 'HELLO WORLD'],
    [lowerCaseCommand, 'HELLO WORLD', 'hello world'],
    [titleCaseCommand, 'hello world', 'Hello World'],
    [sentenceCaseCommand, 'HELLO. world!', 'Hello. World!'],
    [snakeCaseCommand, 'Hello World', 'hello_world'],
    [kebabCaseCommand, 'Hello World', 'hello-world'],
  ])('transforms selection (%#)', (cmd, input, expected) => {
    const m = mount(input);
    setSel(m.handle.view, 0, input.length);
    cmd(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe(expected);
    disposeMount(m);
  });

  it('case-convert is a no-op without selection', () => {
    const m = mount('hello');
    setSel(m.handle.view, 5);
    const result = upperCaseCommand(m.handle.view);
    expect(result).toBe(false);
    expect(m.handle.view.state.doc.toString()).toBe('hello');
    disposeMount(m);
  });
});

describe('cm6Commands sortLines', () => {
  it('sorts lines covered by selection alphabetically', () => {
    const m = mount('charlie\nalpha\nbravo\n');
    setSel(m.handle.view, 0, 19);
    sortLinesCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('alpha\nbravo\ncharlie\n');
    disposeMount(m);
  });
});

describe('cm6Commands specialChars', () => {
  it('SPECIAL_CHARS contains 24 entries', () => {
    expect(SPECIAL_CHARS.length).toBe(24);
  });

  it('factory inserts the supplied char at cursor', () => {
    const m = mount('a');
    setSel(m.handle.view, 1);
    specialCharCommand('→')(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('a→');
    disposeMount(m);
  });
});

describe('cm6Commands wikiLink + imageWithSize', () => {
  it('wikiLinkCommand wraps selection with [[ ]]', () => {
    const m = mount('see Page Two now');
    setSel(m.handle.view, 4, 12);
    wikiLinkCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('see [[Page Two]] now');
    disposeMount(m);
  });

  it('imageWithSizeCommand inserts the imsize syntax', () => {
    const m = mount('');
    imageWithSizeCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('![alt text](https://example.com/image.png =300x)');
    disposeMount(m);
  });

  it('imageWithSizeCommand uses selection as alt text', () => {
    const m = mount('see Logo here');
    setSel(m.handle.view, 4, 8);
    imageWithSizeCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('see ![Logo](https://example.com/image.png =300x) here');
    disposeMount(m);
  });
});

describe('cm6Commands tableInsert', () => {
  it('buildTable produces correct shape for 3x3', () => {
    const t = buildTable(3, 3);
    expect(t.split('\n').length).toBe(4); // header + sep + 2 body rows
    expect(t).toContain('| Col 1 | Col 2 | Col 3 |');
    expect(t).toContain('| --- | --- | --- |');
  });

  it('table2x2Command inserts a 2x2 table', () => {
    const m = mount('');
    table2x2Command(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toContain('| Col 1 | Col 2 |');
    disposeMount(m);
  });

  it.each([
    [table3x3Command, 4],
    [table5x4Command, 6],
    [table10x4Command, 11],
  ])('table size factory inserts the right line count (%#)', (cmd, expectedLines) => {
    const m = mount('');
    cmd(m.handle.view);
    // doc = block + trailing newline
    const lines = m.handle.view.state.doc.toString().trimEnd().split('\n');
    expect(lines.length).toBe(expectedLines);
    disposeMount(m);
  });
});

describe('cm6Commands registry coverage', () => {
  it('exposes 35 named commands keyed by method', () => {
    const keys = Object.keys(cm6Commands).sort();
    expect(keys).toEqual([
      'bold', 'calloutCaution', 'calloutImportant', 'calloutNote', 'calloutTip', 'calloutWarning',
      'date', 'dateTime', 'frontmatter', 'highlight', 'horizontalRule', 'imageWithSize',
      'inlineCode', 'italic', 'kebabCase', 'lowerCase', 'math', 'mermaid', 'music',
      'sentenceCase', 'snakeCase', 'sortLines', 'strikethrough', 'subscript',
      'superscript', 'table10x4', 'table2x2', 'table3x3', 'table4x3', 'table5x4',
      'time', 'titleCase', 'upperCase', 'wikiLink',
    ].sort());
  });
});
