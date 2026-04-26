import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountCm6Editor } from '../../../src/services/editor/cm6/cm6Editor';
import {
  addClassRange,
  removeClassRange,
  updateClassRange,
  getClassRangeEntries,
} from '../../../src/services/editor/cm6/cm6Decorations';

function setup(doc) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const handle = mountCm6Editor(host, { doc });
  return { host, handle };
}

describe('cm6Decorations (Stage 3 batch 8)', () => {
  let host;
  let handle;

  beforeEach(() => { ({ host, handle } = setup('hello world')); });
  afterEach(() => { handle.dispose(); document.body.removeChild(host); });

  it('addClassRange adds an entry with the supplied span', () => {
    const id = addClassRange(handle.view, 0, 5, 'mark-foo');
    const entries = getClassRangeEntries(handle.view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id, from: 0, to: 5, className: 'mark-foo' });
  });

  it('removeClassRange drops the entry', () => {
    const id = addClassRange(handle.view, 0, 5, 'mark-foo');
    removeClassRange(handle.view, id);
    expect(getClassRangeEntries(handle.view.state)).toHaveLength(0);
  });

  it('updateClassRange reuses the same id with new from/to/className', () => {
    const id = addClassRange(handle.view, 0, 5, 'old');
    updateClassRange(handle.view, id, 6, 11, 'new');
    const entries = getClassRangeEntries(handle.view.state);
    expect(entries[0]).toMatchObject({ id, from: 6, to: 11, className: 'new' });
  });

  it('range maps across an insert before its from', () => {
    const id = addClassRange(handle.view, 6, 11, 'world');
    handle.view.dispatch({ changes: { from: 0, insert: '!!!' } });
    const entries = getClassRangeEntries(handle.view.state);
    const e = entries.find(x => x.id === id);
    expect(e.from).toBe(9);
    expect(e.to).toBe(14);
  });

  it('range collapses when its content is deleted', () => {
    const id = addClassRange(handle.view, 6, 11, 'world');
    handle.view.dispatch({ changes: { from: 6, to: 11 } });
    const entries = getClassRangeEntries(handle.view.state);
    const e = entries.find(x => x.id === id);
    // Either filtered out (from === to) or collapsed.
    expect(e == null || e.from === e.to).toBe(true);
  });

  it('renders a span with the configured class for the visible viewport', async () => {
    addClassRange(handle.view, 0, 5, 'mark-foo');
    // Force a measure tick so the decoration set is committed to the DOM.
    handle.view.requestMeasure();
    await new Promise(r => setTimeout(r, 30));
    const found = host.querySelector('.cm-content .mark-foo');
    expect(found).toBeTruthy();
    expect(found.textContent).toBe('hello');
  });

  it('renders configured attributes on the span', async () => {
    addClassRange(handle.view, 0, 5, 'mark-bar', { 'data-discussion-id': 'D-42' });
    handle.view.requestMeasure();
    await new Promise(r => setTimeout(r, 30));
    const found = host.querySelector('[data-discussion-id="D-42"]');
    expect(found).toBeTruthy();
    expect(found.classList.contains('mark-bar')).toBe(true);
  });
});
