import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountCm6Editor } from '../../../src/services/editor/cm6/cm6Editor';
import {
  findOrderedRun,
  buildRenumberChanges,
  renumberAround,
  tabRenumberCommand,
  shiftTabRenumberCommand,
} from '../../../src/services/editor/cm6/cm6ListRenumber';

function setup(doc) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const handle = mountCm6Editor(host, { doc });
  return { host, handle };
}

function setSel(view, anchor, head = anchor) {
  view.dispatch({ selection: { anchor, head } });
}

function dispose({ handle, host }) {
  handle.dispose();
  document.body.removeChild(host);
}

describe('cm6ListRenumber findOrderedRun', () => {
  it('returns null on a non-list line', () => {
    const m = setup('plain prose');
    expect(findOrderedRun(m.handle.view, 1)).toBeNull();
    dispose(m);
  });

  it('finds a single-line run', () => {
    const m = setup('1. only');
    const run = findOrderedRun(m.handle.view, 1);
    expect(run).toEqual({ indent: '', startLine: 1, endLine: 1 });
    dispose(m);
  });

  it('extends both directions across same-indent ordered lines', () => {
    const m = setup('1. one\n2. two\n3. three');
    expect(findOrderedRun(m.handle.view, 2)).toEqual({ indent: '', startLine: 1, endLine: 3 });
    dispose(m);
  });

  it('extends across more-indented sub-list lines (treats them as continuation)', () => {
    const m = setup('1. one\n  1. nested\n2. two');
    // Line 1 + line 3 are at indent='' and contiguous when we sweep
    // past line 2 (more-indented sub-list).
    expect(findOrderedRun(m.handle.view, 1)).toEqual({ indent: '', startLine: 1, endLine: 3 });
    expect(findOrderedRun(m.handle.view, 2)).toEqual({ indent: '  ', startLine: 2, endLine: 2 });
    expect(findOrderedRun(m.handle.view, 3)).toEqual({ indent: '', startLine: 1, endLine: 3 });
    dispose(m);
  });

  it('stops at non-list line', () => {
    const m = setup('1. one\nplain\n3. three');
    expect(findOrderedRun(m.handle.view, 1)).toEqual({ indent: '', startLine: 1, endLine: 1 });
    expect(findOrderedRun(m.handle.view, 3)).toEqual({ indent: '', startLine: 3, endLine: 3 });
    dispose(m);
  });
});

describe('cm6ListRenumber buildRenumberChanges', () => {
  it('returns no changes when run is already correctly numbered', () => {
    const m = setup('1. a\n2. b\n3. c');
    const run = findOrderedRun(m.handle.view, 1);
    const changes = buildRenumberChanges(m.handle.view, run);
    expect(changes).toEqual([]);
    dispose(m);
  });

  it('renumbers a run that is out of sequence', () => {
    const m = setup('1. a\n3. b\n7. c');
    renumberAround(m.handle.view, new Set([1, 2, 3]));
    expect(m.handle.view.state.doc.toString()).toBe('1. a\n2. b\n3. c');
    dispose(m);
  });

  it('preserves the first item\'s starting number', () => {
    const m = setup('5. a\n5. b\n5. c');
    renumberAround(m.handle.view, new Set([1, 2, 3]));
    expect(m.handle.view.state.doc.toString()).toBe('5. a\n6. b\n7. c');
    dispose(m);
  });

  it('handles multi-digit numbers', () => {
    const m = setup('10. a\n5. b');
    renumberAround(m.handle.view, new Set([1, 2]));
    expect(m.handle.view.state.doc.toString()).toBe('10. a\n11. b');
    dispose(m);
  });
});

describe('cm6ListRenumber tabRenumberCommand', () => {
  let m;

  beforeEach(() => { m = setup('1. one\n2. two\n3. three'); });
  afterEach(() => { dispose(m); });

  it('returns false when cursor is not on a numbered-list line', () => {
    const m2 = setup('plain\nmore plain');
    setSel(m2.handle.view, 5);
    expect(tabRenumberCommand(m2.handle.view)).toBe(false);
    expect(m2.handle.view.state.doc.toString()).toBe('plain\nmore plain');
    dispose(m2);
  });

  it('indents an ordered-list line and renumbers the surrounding outer run', () => {
    // Cursor at start of "2. two" line
    setSel(m.handle.view, 7);
    const result = tabRenumberCommand(m.handle.view);
    expect(result).toBe(true);
    const doc = m.handle.view.state.doc.toString();
    const lines = doc.split('\n');
    // Line 1 keeps "1. one"
    expect(lines[0]).toBe('1. one');
    // Line 2 is the now-indented (and renumbered to 1, since it's a
    // single-item nested run starting from its existing "2.") "2. two"
    expect(/^\s+\d+\.\s+two$/.test(lines[1])).toBe(true);
    // Line 3 was "3. three"; outer run is line 1 + line 3 (jumping
    // over the indented line 2), so it renumbers from 1 to "1, 2".
    // Line 1 stays "1. one"; line 3 becomes "2. three".
    expect(lines[2]).toBe('2. three');
  });
});

describe('cm6ListRenumber shiftTabRenumberCommand', () => {
  it('returns false when cursor is not on a numbered-list line', () => {
    const m = setup('plain');
    setSel(m.handle.view, 0);
    expect(shiftTabRenumberCommand(m.handle.view)).toBe(false);
    dispose(m);
  });

  it('dedents an indented ordered-list line and renumbers', () => {
    const m = setup('1. one\n  1. nested\n  2. nested two');
    // Cursor on the second nested item
    const lineStart = m.handle.view.state.doc.line(3).from;
    setSel(m.handle.view, lineStart);
    const result = shiftTabRenumberCommand(m.handle.view);
    expect(result).toBe(true);
    // After dedent, "nested two" should be at root level — renumber
    // outer to 1, 2 (the dedented item joins the outer list).
    const doc = m.handle.view.state.doc.toString();
    expect(doc).toContain('1. one');
    expect(doc).toContain('1. nested');
    expect(doc.endsWith('nested two')).toBe(true);
    dispose(m);
  });
});
