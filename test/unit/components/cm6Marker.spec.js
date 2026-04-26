import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountCm6Editor } from '../../../src/services/editor/cm6/cm6Editor';
import {
  addMarker,
  removeMarker,
  getMarkers,
  getMarkerOffset,
} from '../../../src/services/editor/cm6/cm6Marker';
import {
  getSelection,
  setSelection,
  hasFocus,
} from '../../../src/services/editor/cm6/cm6Selection';

function mount(doc) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const handle = mountCm6Editor(host, { doc });
  return { handle, host };
}

describe('cm6Marker (Stage 3 batch 3)', () => {
  let host;
  let handle;

  beforeEach(() => {
    ({ host, handle } = mount('hello world'));
  });

  afterEach(() => {
    handle.dispose();
    document.body.removeChild(host);
  });

  it('addMarker registers an entry with the supplied offset', () => {
    const id = addMarker(handle.view, 6);
    expect(getMarkerOffset(handle.view.state, id)).toBe(6);
    expect(getMarkers(handle.view.state)).toHaveLength(1);
  });

  it('removeMarker drops the entry', () => {
    const id = addMarker(handle.view, 6);
    removeMarker(handle.view, id);
    expect(getMarkerOffset(handle.view.state, id)).toBeNull();
    expect(getMarkers(handle.view.state)).toHaveLength(0);
  });

  it('non-trailing marker is pushed forward by an insert at its position', () => {
    // doc: "hello world", insert at offset 5 → "helloXY world" (marker at 5, non-trailing → assoc=1, gets pushed to 7)
    const id = addMarker(handle.view, 5, false);
    handle.view.dispatch({ changes: { from: 5, insert: 'XY' } });
    expect(getMarkerOffset(handle.view.state, id)).toBe(7);
  });

  it('trailing marker stays put when text is inserted at its position', () => {
    const id = addMarker(handle.view, 5, true);
    handle.view.dispatch({ changes: { from: 5, insert: 'XY' } });
    expect(getMarkerOffset(handle.view.state, id)).toBe(5);
  });

  it('marker survives an insert before its position by shifting forward', () => {
    const id = addMarker(handle.view, 6);
    handle.view.dispatch({ changes: { from: 0, insert: '!' } });
    expect(getMarkerOffset(handle.view.state, id)).toBe(7);
  });

  it('marker survives an insert after its position unchanged', () => {
    const id = addMarker(handle.view, 5);
    handle.view.dispatch({ changes: { from: 8, insert: '!' } });
    expect(getMarkerOffset(handle.view.state, id)).toBe(5);
  });

  it('marker clamps to the deletion boundary when its position is removed', () => {
    // doc: "hello world", marker at 6, delete [4, 8] → "hellld" (marker clamps to 4)
    const id = addMarker(handle.view, 6);
    handle.view.dispatch({ changes: { from: 4, to: 8 } });
    expect(getMarkerOffset(handle.view.state, id)).toBe(4);
  });

  it('multiple markers track independently', () => {
    const a = addMarker(handle.view, 0);
    const b = addMarker(handle.view, 5);
    const c = addMarker(handle.view, 11, true);
    handle.view.dispatch({ changes: { from: 5, insert: 'X' } });
    expect(getMarkerOffset(handle.view.state, a)).toBe(0);
    // Marker at 5, non-trailing → assoc=1 → pushed to 6
    expect(getMarkerOffset(handle.view.state, b)).toBe(6);
    // Marker at end, doc grew by 1 — end shifted to 12
    expect(getMarkerOffset(handle.view.state, c)).toBe(12);
  });
});

describe('cm6Selection (Stage 3 batch 3)', () => {
  let host;
  let handle;

  beforeEach(() => {
    ({ host, handle } = mount('the quick brown fox'));
  });

  afterEach(() => {
    handle.dispose();
    document.body.removeChild(host);
  });

  it('getSelection reads the main range', () => {
    expect(getSelection(handle.view)).toEqual({ start: 0, end: 0 });
  });

  it('setSelection updates the main range', () => {
    setSelection(handle.view, { start: 4, end: 9 });
    expect(getSelection(handle.view)).toEqual({ start: 4, end: 9 });
  });

  it('hasFocus reports view focus state', () => {
    // Newly mounted views in happy-dom typically aren't focused.
    expect(typeof hasFocus(handle.view)).toBe('boolean');
  });
});
