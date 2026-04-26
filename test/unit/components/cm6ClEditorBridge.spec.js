import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createCm6ClEditorBridge,
  Cm6Marker,
} from '../../../src/services/editor/cm6/cm6ClEditorBridge';

function setup(initialContent = '') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const bridge = createCm6ClEditorBridge(host);
  bridge.init({ content: initialContent });
  return { host, bridge };
}

describe('cm6ClEditorBridge — content & selection', () => {
  let host;
  let bridge;

  beforeEach(() => { ({ host, bridge } = setup('hello world')); });
  afterEach(() => { bridge.destroy(); document.body.removeChild(host); });

  it('getContent() returns init content', () => {
    expect(bridge.getContent()).toBe('hello world');
  });

  it('setContent() replaces doc and returns diff offsets', () => {
    const r = bridge.setContent('hello brave new world');
    expect(bridge.getContent()).toBe('hello brave new world');
    expect(r.start).toBe(6);
  });

  it('setContent() with identical value is a no-op', () => {
    const r = bridge.setContent('hello world');
    expect(bridge.getContent()).toBe('hello world');
    expect(r.range).toBeNull();
  });

  it('replace(start, end, text) inserts and moves cursor to end', () => {
    bridge.replace(0, 5, 'HEY');
    expect(bridge.getContent()).toBe('HEY world');
    expect(bridge.selectionMgr.selectionStart).toBe(3);
    expect(bridge.selectionMgr.selectionEnd).toBe(3);
  });

  it('replaceAll() rewrites every match', () => {
    bridge.replaceAll(/o/g, '0');
    expect(bridge.getContent()).toBe('hell0 w0rld');
  });

  it('selectionMgr.setSelectionStartEnd updates main range', () => {
    bridge.selectionMgr.setSelectionStartEnd(0, 5);
    expect(bridge.selectionMgr.selectionStart).toBe(0);
    expect(bridge.selectionMgr.selectionEnd).toBe(5);
    expect(bridge.selectionMgr.getSelectedText()).toBe('hello');
  });

  it('selectionMgr.createRange returns from/to pair', () => {
    const r = bridge.selectionMgr.createRange(2, 7);
    expect(r).toEqual({ from: 2, to: 7 });
  });
});

describe('cm6ClEditorBridge — events', () => {
  let host;
  let bridge;

  beforeEach(() => { ({ host, bridge } = setup('')); });
  afterEach(() => { bridge.destroy(); document.body.removeChild(host); });

  it("'contentChanged' fires after each replace with text + diffs + sectionList", () => {
    const calls = [];
    bridge.on('contentChanged', (text, diffs, sections) => calls.push({ text, diffsLen: diffs?.length, sections }));
    bridge.replace(0, 0, 'abc');
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const last = calls[calls.length - 1];
    expect(last.text).toBe('abc');
    expect(Array.isArray(last.sections)).toBe(true);
  });

  it("'contentChanged' includes sectionParser output when supplied", () => {
    bridge.init({ content: '', sectionParser: (text) => [{ data: 'main', text }] });
    let captured;
    bridge.on('contentChanged', (_t, _d, sections) => { captured = sections; });
    bridge.replace(0, 0, 'X');
    expect(captured).toEqual([{ data: 'main', text: 'X' }]);
  });

  it("selectionMgr.on('selectionChanged') fires on selection update", () => {
    const calls = [];
    bridge.selectionMgr.on('selectionChanged', (s, e) => calls.push([s, e]));
    bridge.selectionMgr.setSelectionStartEnd(0, 0);
    bridge.replace(0, 0, 'hello');
    bridge.selectionMgr.setSelectionStartEnd(0, 5);
    expect(calls.some(([s, e]) => s === 0 && e === 5)).toBe(true);
  });

  it("undoMgr emits 'undoStateChange' on doc change", () => {
    const calls = [];
    bridge.undoMgr.on('undoStateChange', () => calls.push(1));
    bridge.replace(0, 0, 'x');
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("highlighter.on('highlighted') fires on doc change", () => {
    const calls = [];
    bridge.highlighter.on('highlighted', () => calls.push(1));
    bridge.replace(0, 0, 'y');
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('off(evt, fn) removes a single listener', () => {
    let n = 0;
    const fn = () => { n += 1; };
    bridge.on('contentChanged', fn);
    bridge.replace(0, 0, 'a');
    bridge.off('contentChanged', fn);
    bridge.replace(1, 1, 'b');
    expect(n).toBe(1);
  });
});

describe('cm6ClEditorBridge — undo/redo', () => {
  let host;
  let bridge;

  beforeEach(() => { ({ host, bridge } = setup('start')); });
  afterEach(() => { bridge.destroy(); document.body.removeChild(host); });

  it('canUndo/canRedo reflect history depth', () => {
    expect(bridge.undoMgr.canUndo()).toBe(false);
    bridge.replace(5, 5, ' more');
    expect(bridge.undoMgr.canUndo()).toBe(true);
    expect(bridge.undoMgr.canRedo()).toBe(false);
  });

  it('undo() reverts the last change', () => {
    bridge.replace(5, 5, ' more');
    expect(bridge.getContent()).toBe('start more');
    bridge.undoMgr.undo();
    expect(bridge.getContent()).toBe('start');
  });

  it('redo() reapplies after undo', () => {
    bridge.replace(5, 5, ' more');
    bridge.undoMgr.undo();
    bridge.undoMgr.redo();
    expect(bridge.getContent()).toBe('start more');
  });
});

describe('cm6ClEditorBridge — markers', () => {
  let host;
  let bridge;

  beforeEach(() => { ({ host, bridge } = setup('hello world')); });
  afterEach(() => { bridge.destroy(); document.body.removeChild(host); });

  it('addMarker registers under $markers[id]', () => {
    const m = new Cm6Marker(5);
    bridge.addMarker(m);
    expect(bridge.$markers[m.id]).toBe(m);
  });

  it('removeMarker drops the entry', () => {
    const m = new Cm6Marker(5);
    bridge.addMarker(m);
    bridge.removeMarker(m);
    expect(bridge.$markers[m.id]).toBeUndefined();
  });

  it("marker.offset is updated on doc change (via StateField mapPos)", () => {
    const m = new Cm6Marker(5, false);
    bridge.addMarker(m);
    bridge.replace(0, 0, '!!!'); // 3-char insert before marker at offset 5
    // Marker should have shifted forward to 8.
    expect(m.offset).toBe(8);
  });

  it('trailing marker stays put on insert at its position', () => {
    const m = new Cm6Marker(5, true);
    bridge.addMarker(m);
    bridge.replace(5, 5, 'XYZ');
    expect(m.offset).toBe(5);
  });
});

describe('cm6ClEditorBridge — toggleEditable / focus', () => {
  let host;
  let bridge;

  beforeEach(() => { ({ host, bridge } = setup('content')); });
  afterEach(() => { bridge.destroy(); document.body.removeChild(host); });

  it('toggleEditable(false) sets read-only, true restores', () => {
    bridge.toggleEditable(false);
    expect(bridge.view.state.facet(/* lazy */ require('@codemirror/view').EditorView.editable)).toBe(false);
    bridge.toggleEditable(true);
    expect(bridge.view.state.facet(require('@codemirror/view').EditorView.editable)).toBe(true);
  });

  it('focus() does not throw', () => {
    expect(() => bridge.focus()).not.toThrow();
  });
});

describe('cm6ClEditorBridge — init lifecycle', () => {
  it('init({content, sectionParser}) emits contentChanged with the initial doc', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const bridge = createCm6ClEditorBridge(host);
    const calls = [];
    bridge.on('contentChanged', (text, _d, sections) => calls.push({ text, sections }));
    bridge.init({ content: 'hello', sectionParser: (t) => [{ data: 'main', text: t }] });
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].text).toBe('hello');
    expect(calls[0].sections).toEqual([{ data: 'main', text: 'hello' }]);
    expect(bridge.parsingCtx.sectionList).toEqual([{ data: 'main', text: 'hello' }]);
    bridge.destroy();
    document.body.removeChild(host);
  });
});
