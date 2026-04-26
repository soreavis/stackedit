// Lightweight CM6 builder for the two niche editors that don't need the
// full main-editor surface: `CodeEditor.vue` (settings YAML editor) and
// `gutters/NewComment.vue` (comment input). Skipping line numbers,
// active-line highlights, decorations, marker fields — those would
// look out of place in a small textarea-shaped editor and inflate
// the chunk for nothing. Markdown language is optional (NewComment
// wants it for in-comment markdown rendering; CodeEditor uses plain
// text so settings YAML reads as a monospace block).
import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView, keymap, drawSelection,
} from '@codemirror/view';
import {
  history, historyKeymap, defaultKeymap, indentWithTab,
} from '@codemirror/commands';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { stackeditHighlight } from './cm6Highlighter';

class Emitter {
  private map: Record<string, Array<(...args: any[]) => void>> = Object.create(null);
  on(evt: string, fn: (...args: any[]) => void) {
    (this.map[evt] ||= []).push(fn);
    return this;
  }
  off(evt: string, fn?: (...args: any[]) => void) {
    if (!this.map[evt]) return this;
    if (!fn) delete this.map[evt];
    else this.map[evt] = this.map[evt].filter(f => f !== fn);
    return this;
  }
  emit(evt: string, ...args: any[]) {
    (this.map[evt] || []).slice().forEach((fn) => {
      try { fn(...args); } catch (err) { console.error(err); }
    });
  }
}

export interface SmallEditorOptions {
  content?: string;
  selectionStart?: number;
  selectionEnd?: number;
  language?: 'markdown' | 'plain';
  readOnly?: boolean;
}

export interface SmallEditorSelectionMgr {
  selectionStart: number;
  selectionEnd: number;
  setSelectionStartEnd(start: number, end: number): void;
  on(evt: 'selectionChanged', fn: (start: number, end: number) => void): void;
}

export interface SmallEditorHandle {
  view: EditorView;
  selectionMgr: SmallEditorSelectionMgr;
  getContent(): string;
  setContent(text: string): void;
  toggleEditable(value: boolean): void;
  focus(): void;
  on(evt: 'contentChanged' | 'focus', fn: (...args: any[]) => void): void;
  off(evt: 'contentChanged' | 'focus', fn?: (...args: any[]) => void): void;
  destroy(): void;
}

export function mountSmallEditor(parent: HTMLElement, options: SmallEditorOptions = {}): SmallEditorHandle {
  const {
    content = '',
    selectionStart = 0,
    selectionEnd = selectionStart,
    language = 'markdown',
    readOnly = false,
  } = options;

  const editorEmitter = new Emitter();
  const selectionEmitter = new Emitter();
  const editableCompartment = new Compartment();
  let lastSelection = { from: selectionStart, to: selectionEnd };

  const extensions = [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    stackeditHighlight(),
    ...(language === 'markdown' ? [markdown()] : []),
    keymap.of([
      ...markdownKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    editableCompartment.of(EditorView.editable.of(!readOnly)),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        editorEmitter.emit('contentChanged', update.state.doc.toString());
      }
      if (update.selectionSet || update.docChanged) {
        const main = update.state.selection.main;
        if (main.from !== lastSelection.from || main.to !== lastSelection.to) {
          lastSelection = { from: main.from, to: main.to };
          selectionEmitter.emit('selectionChanged', main.from, main.to);
        }
      }
      if (update.focusChanged && update.view.hasFocus) {
        editorEmitter.emit('focus');
      }
    }),
  ];

  const view = new EditorView({
    state: EditorState.create({ doc: content, extensions }),
    parent,
  });

  // Restore initial selection (CM6 starts at 0,0).
  if (selectionStart || selectionEnd) {
    try {
      view.dispatch({
        selection: { anchor: Math.min(selectionStart, content.length), head: Math.min(selectionEnd, content.length) },
      });
      lastSelection = { from: selectionStart, to: selectionEnd };
    } catch { /* ignore */ }
  }

  const selectionMgr: SmallEditorSelectionMgr = {
    get selectionStart() { return view.state.selection.main.from; },
    get selectionEnd() { return view.state.selection.main.to; },
    set selectionStart(_v: number) { /* set via setSelectionStartEnd */ },
    set selectionEnd(_v: number) { /* set via setSelectionStartEnd */ },
    setSelectionStartEnd(start, end) {
      try {
        view.dispatch({ selection: { anchor: start, head: end } });
      } catch { /* ignore */ }
    },
    on(evt, fn) { selectionEmitter.on(evt, fn); },
  };

  return {
    view,
    selectionMgr,
    getContent() { return view.state.doc.toString(); },
    setContent(text) {
      const current = view.state.doc.toString();
      if (current === text) return;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: text },
      });
    },
    toggleEditable(value) {
      view.dispatch({
        effects: editableCompartment.reconfigure(EditorView.editable.of(value)),
      });
    },
    focus() { view.focus(); },
    on(evt, fn) { editorEmitter.on(evt, fn); },
    off(evt, fn) { editorEmitter.off(evt, fn); },
    destroy() { view.destroy(); },
  };
}
