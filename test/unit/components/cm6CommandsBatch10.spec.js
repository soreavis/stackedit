import { describe, it, expect } from 'vitest';
import { mountCm6Editor } from '../../../src/services/editor/cm6/cm6Editor';
import {
  ulistCommand,
  olistCommand,
  clistCommand,
  quoteCommand,
  codeCommand,
  heading1Command,
  heading2Command,
  heading3Command,
  linkCommand,
  imageCommand,
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

function dispose({ handle, host }) {
  handle.dispose();
  document.body.removeChild(host);
}

describe('cm6Commands list / quote prefixers', () => {
  it('ulistCommand prefixes selected lines with `- `', () => {
    const m = mount('one\ntwo\nthree');
    setSel(m.handle.view, 0, 13);
    ulistCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('- one\n- two\n- three');
    dispose(m);
  });

  it('olistCommand numbers selected lines starting at 1', () => {
    const m = mount('a\nb\nc');
    setSel(m.handle.view, 0, 5);
    olistCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('1. a\n2. b\n3. c');
    dispose(m);
  });

  it('clistCommand prefixes with `- [ ] `', () => {
    const m = mount('todo');
    setSel(m.handle.view, 0, 4);
    clistCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('- [ ] todo');
    dispose(m);
  });

  it('quoteCommand prefixes selected lines with `> `', () => {
    const m = mount('a\nb');
    setSel(m.handle.view, 0, 3);
    quoteCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('> a\n> b');
    dispose(m);
  });
});

describe('cm6Commands codeCommand', () => {
  it('inline-wraps a single-line selection', () => {
    const m = mount('foo bar baz');
    setSel(m.handle.view, 4, 7);
    codeCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('foo `bar` baz');
    dispose(m);
  });

  it('fences a multi-line selection', () => {
    const m = mount('a\nb\nc');
    setSel(m.handle.view, 0, 5);
    codeCommand(m.handle.view);
    // insertBlock guarantees a trailing newline at EOF so the fence
    // line isn't the last char of the doc — mirrors padForBlock.
    expect(m.handle.view.state.doc.toString()).toBe('```\na\nb\nc\n```\n');
    dispose(m);
  });

  it('inserts a placeholder backtick wrap when nothing is selected', () => {
    const m = mount('start');
    setSel(m.handle.view, 5);
    codeCommand(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('start`code`');
    dispose(m);
  });
});

describe('cm6Commands heading factory', () => {
  it.each([
    [heading1Command, '# '],
    [heading2Command, '## '],
    [heading3Command, '### '],
  ])('applies the right prefix (%#)', (cmd, prefix) => {
    const m = mount('hello');
    setSel(m.handle.view, 0);
    cmd(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe(`${prefix}hello`);
    dispose(m);
  });

  it('replaces an existing heading prefix instead of nesting', () => {
    const m = mount('### inner');
    setSel(m.handle.view, 4);
    heading1Command(m.handle.view);
    expect(m.handle.view.state.doc.toString()).toBe('# inner');
    dispose(m);
  });
});

describe('cm6Commands link/image factories', () => {
  it('linkCommand inserts [text](url) at the captured selection', () => {
    const m = mount('see foo here');
    setSel(m.handle.view, 4, 7);
    let invokedCallback;
    linkCommand(cb => { invokedCallback = cb; })(m.handle.view);
    invokedCallback('https://example.com');
    expect(m.handle.view.state.doc.toString()).toBe('see [foo](https://example.com) here');
    dispose(m);
  });

  it('linkCommand falls back to "link" when nothing is selected', () => {
    const m = mount('start');
    setSel(m.handle.view, 5);
    let invokedCallback;
    linkCommand(cb => { invokedCallback = cb; })(m.handle.view);
    invokedCallback('https://example.com');
    expect(m.handle.view.state.doc.toString()).toBe('start[link](https://example.com)');
    dispose(m);
  });

  it('imageCommand inserts ![alt](url)', () => {
    const m = mount('caption');
    setSel(m.handle.view, 0, 7);
    let invokedCallback;
    imageCommand(cb => { invokedCallback = cb; })(m.handle.view);
    invokedCallback('https://i.example.com/x.png');
    expect(m.handle.view.state.doc.toString()).toBe('![caption](https://i.example.com/x.png)');
    dispose(m);
  });

  it('linkCommand returning null leaves the doc untouched', () => {
    const m = mount('see foo here');
    setSel(m.handle.view, 4, 7);
    let invokedCallback;
    linkCommand(cb => { invokedCallback = cb; })(m.handle.view);
    invokedCallback(null);
    expect(m.handle.view.state.doc.toString()).toBe('see foo here');
    dispose(m);
  });
});
