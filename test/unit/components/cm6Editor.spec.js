import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountCm6Editor, isCm6FlagEnabled } from '../../../src/services/editor/cm6/cm6Editor';

describe('cm6Editor (Stage 3 batch 1 leaf)', () => {
  let host;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  it('mounts a CodeMirror 6 EditorView with the supplied doc', () => {
    const handle = mountCm6Editor(host, { doc: '# hello\n\nworld' });
    expect(handle.view).toBeTruthy();
    expect(handle.view.state.doc.toString()).toBe('# hello\n\nworld');
    expect(host.querySelector('.cm-editor')).toBeTruthy();
    handle.dispose();
  });

  it('dispose() destroys the view and removes its DOM', () => {
    const handle = mountCm6Editor(host, { doc: 'temp' });
    expect(host.querySelector('.cm-editor')).toBeTruthy();
    handle.dispose();
    expect(host.querySelector('.cm-editor')).toBeNull();
  });

  it('accepts extraExtensions without crashing', () => {
    const handle = mountCm6Editor(host, { doc: '', extraExtensions: [] });
    expect(handle.view.state.doc.toString()).toBe('');
    handle.dispose();
  });

  it('isCm6FlagEnabled() returns false when query string has no cm6 param', () => {
    expect(isCm6FlagEnabled()).toBe(false);
  });
});
