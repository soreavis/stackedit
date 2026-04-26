// Stage 3 batch 5 — drop-in clEditor-shaped bridge backed by CM6.
//
// Surface (per the grep over src/): selectionMgr (selectionStart, selectionEnd,
// hasFocus, setSelectionStartEnd, on('selectionChanged'), createRange,
// getCoordinates, getSelectedText), undoMgr (canUndo/canRedo/undo/redo,
// on('undoStateChange'), setCurrentMode), watcher.noWatch, addMarker,
// removeMarker, addKeystroke (no-op for now — keymaps via init options),
// init, getContent, setContent, replace, replaceAll, focus, toggleEditable,
// on/off, highlighter.on('sectionHighlighted' | 'highlighted').
//
// `parsingCtx.sectionList` is fed via the `sectionParser` option callback
// the same way cledit does it (editorSvc supplies a parser; the bridge
// invokes it after every doc change and emits `contentChanged(text, diffs,
// sections)`). Patch-handler / undo bridging defers to CM6's history
// extension — diff-match-patch patches don't round-trip through CM6's
// undo stack, so the patchHandler is accepted but unused.
import {
  EditorState, EditorSelection, Compartment,
  type Extension,
} from '@codemirror/state';
import {
  EditorView, keymap,
  lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, rectangularSelection, crosshairCursor,
} from '@codemirror/view';
import {
  history, historyKeymap, defaultKeymap, indentWithTab,
  undo as cm6Undo, redo as cm6Redo, undoDepth, redoDepth,
} from '@codemirror/commands';
import { Transaction } from '@codemirror/state';
import { bracketMatching } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import DiffMatchPatch from 'diff-match-patch';
import { stackeditHighlight } from './cm6Highlighter';
import {
  markerField, addMarkerEffect, removeMarkerEffect,
  type MarkerEntry,
} from './cm6Marker';
import {
  classRangeField,
  addClassRange,
  removeClassRange,
  updateClassRange,
} from './cm6Decorations';

const dmp = new DiffMatchPatch();

// -------- tiny event emitter (cledit-compatible signature) --------
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

// Marker class lives in cm6MarkerClass.ts so stores / components can
// import it without dragging in @codemirror/* (which would blow the
// main-bundle size-limit). Re-export here for the bridge surface.
export { Cm6Marker } from './cm6MarkerClass';
import { Cm6Marker } from './cm6MarkerClass';

// -------- option types --------
export interface SectionEntry { data: string; text: string; }
export interface SectionForHighlighter { data: string; text: string; elt?: HTMLElement; }

export interface BridgeInitOptions {
  content?: string;
  selectionStart?: number;
  selectionEnd?: number;
  sectionParser?: (text: string) => SectionEntry[];
  sectionHighlighter?: (s: SectionForHighlighter) => string;
  patchHandler?: unknown;
  getCursorFocusRatio?: () => number;
}

// -------- bridge --------
export interface Cm6ClEditorBridge {
  $contentElt: HTMLElement;
  $scrollElt: HTMLElement;
  $markers: Record<number, Cm6Marker>;
  view: EditorView;
  selectionMgr: SelectionMgrShim;
  undoMgr: UndoMgrShim;
  watcher: { noWatch(fn: () => void): void };
  highlighter: { on(evt: string, fn: (...args: any[]) => void): void };
  parsingCtx: { sectionList: SectionEntry[] };

  init(opts: BridgeInitOptions): void;
  destroy(): void;
  focus(): void;
  toggleEditable(value?: boolean): void;
  getContent(): string;
  setContent(value: string, noUndo?: boolean): { start: number; end: number; range: unknown };
  setSelection(start: number, end: number): void;
  replace(start: number, end: number, replacement: string): void;
  replaceAll(search: RegExp | string, replacement: string, startOffset?: number): void;
  adjustCursorPosition(): void;
  addMarker(m: Cm6Marker): void;
  removeMarker(m: Cm6Marker): void;
  addKeystroke(_k: unknown): void;
  on(evt: string, fn: (...args: any[]) => void): void;
  off(evt: string, fn?: (...args: any[]) => void): void;
  // Stage 3 batch 8: CM6-native class range API. Replaces the
  // EditorClassApplier DOM-mutation path. Each call returns an id
  // the caller passes back to update / remove.
  addClassRange(from: number, to: number, className: string, attrs?: Record<string, string>): number;
  removeClassRange(id: number): void;
  updateClassRange(id: number, from: number, to: number, className: string): void;
}

interface SelectionMgrShim {
  selectionStart: number;
  selectionEnd: number;
  hasFocus(): boolean;
  setSelectionStartEnd(s: number, e: number): void;
  on(evt: string, fn: (...args: any[]) => void): void;
  createRange(start: number, end: number): { from: number; to: number };
  getSelectedText(): string;
  getCoordinates(offset: number): { top: number; height: number; left: number } | null;
}

interface UndoMgrShim {
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
  on(evt: string, fn: (...args: any[]) => void): void;
  setCurrentMode(_mode: string): void;
  setDefaultMode(_mode: string): void;
}

function baseExtensions(editableCompartment: Compartment): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    rectangularSelection(),
    crosshairCursor(),
    bracketMatching(),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    stackeditHighlight(),
    markdown(),
    markerField,
    classRangeField,
    keymap.of([
      // markdownKeymap first so its Enter handler (continue list,
      // continue blockquote) takes precedence over defaultKeymap's
      // plain newline.
      ...markdownKeymap,
      ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab,
    ]),
    editableCompartment.of(EditorView.editable.of(true)),
  ];
}

export function createCm6ClEditorBridge(
  contentElt: HTMLElement,
  scrollEltOpt?: HTMLElement,
): Cm6ClEditorBridge {
  const scrollElt = scrollEltOpt || contentElt;
  const editorEmitter = new Emitter();
  const selectionEmitter = new Emitter();
  const undoEmitter = new Emitter();
  const highlightEmitter = new Emitter();
  const editableCompartment = new Compartment();

  let lastContent = '';
  let lastSelection = { from: 0, to: 0 };
  const $markers: Record<number, Cm6Marker> = Object.create(null);
  let options: BridgeInitOptions = {};
  let initialized = false;

  // Mount with empty doc; init() supplies the real content.
  const view = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        ...baseExtensions(editableCompartment),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            const diffs = dmp.diff_main(lastContent, newContent);
            lastContent = newContent;
            const sections = options.sectionParser
              ? options.sectionParser(newContent)
              : [];
            bridge.parsingCtx.sectionList = sections;
            // Mirror cledit's `contentChanged(text, diffs, sectionList)`.
            editorEmitter.emit('contentChanged', newContent, diffs, sections);
            // History depth changed → undoMgr listeners should refresh.
            undoEmitter.emit('undoStateChange');
            // Trigger a synthetic "highlighted" pass; section-highlighted
            // is per-section and only emitted when sectionHighlighter is
            // wired (cledit's Prism path) — CM6's syntaxHighlighting is
            // self-contained, so we emit `highlighted` only.
            highlightEmitter.emit('highlighted');
          }
          if (update.selectionSet || update.docChanged) {
            const main = update.state.selection.main;
            const newSel = { from: main.from, to: main.to };
            if (newSel.from !== lastSelection.from || newSel.to !== lastSelection.to) {
              lastSelection = newSel;
              selectionEmitter.emit('selectionChanged', main.from, main.to, main);
            }
          }
          if (update.focusChanged && update.view.hasFocus) {
            editorEmitter.emit('focus');
          }
        }),
      ],
    }),
    parent: contentElt,
  });

  const selectionMgr: SelectionMgrShim = {
    get selectionStart() { return view.state.selection.main.from; },
    get selectionEnd() { return view.state.selection.main.to; },
    set selectionStart(_v: number) { /* set via setSelectionStartEnd */ },
    set selectionEnd(_v: number) { /* set via setSelectionStartEnd */ },
    hasFocus() { return view.hasFocus; },
    setSelectionStartEnd(s, e) {
      view.dispatch({ selection: EditorSelection.range(s, e) });
    },
    on(evt, fn) { selectionEmitter.on(evt, fn); },
    createRange(start, end) { return { from: start, to: end }; },
    getSelectedText() {
      const { from, to } = view.state.selection.main;
      return view.state.doc.sliceString(from, to);
    },
    getCoordinates(offset) {
      try {
        const c = view.coordsAtPos(offset);
        if (!c) return null;
        return { top: c.top, height: c.bottom - c.top, left: c.left };
      } catch { return null; }
    },
  };

  const undoMgr: UndoMgrShim = {
    canUndo() { return undoDepth(view.state) > 0; },
    canRedo() { return redoDepth(view.state) > 0; },
    undo() { cm6Undo(view); undoEmitter.emit('undoStateChange'); },
    redo() { cm6Redo(view); undoEmitter.emit('undoStateChange'); },
    on(evt, fn) { undoEmitter.on(evt, fn); },
    setCurrentMode(_m) { /* no-op — CM6 manages history grouping */ },
    setDefaultMode(_m) { /* no-op */ },
  };

  const bridge: Cm6ClEditorBridge = {
    $contentElt: contentElt,
    $scrollElt: scrollElt,
    $markers,
    view,
    selectionMgr,
    undoMgr,
    watcher: { noWatch(fn) { fn(); } },
    highlighter: { on(evt, fn) { highlightEmitter.on(evt, fn); } },
    parsingCtx: { sectionList: [] },

    init(opts) {
      options = opts || {};
      const content = opts.content;
      if (typeof content === 'string') {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
          // File switches replace the doc — those should NOT be reachable
          // via undo (otherwise hitting Cmd-Z on a freshly-opened file
          // would roll back to the previous file's content).
          annotations: Transaction.addToHistory.of(false),
        });
        lastContent = content;
      } else {
        lastContent = view.state.doc.toString();
      }
      // Restore selection if supplied; otherwise leave at 0.
      const start = opts.selectionStart ?? 0;
      const end = opts.selectionEnd ?? start;
      try {
        view.dispatch({
          selection: EditorSelection.range(
            Math.min(start, view.state.doc.length),
            Math.min(end, view.state.doc.length),
          ),
        });
      } catch { /* ignore out-of-range */ }
      // Initial section parse.
      bridge.parsingCtx.sectionList = options.sectionParser
        ? options.sectionParser(lastContent)
        : [];
      initialized = true;
      // Synthesize a contentChanged on init so consumers (preview pipeline,
      // discussion markers) see the initial state.
      editorEmitter.emit(
        'contentChanged', lastContent, [[0, lastContent]], bridge.parsingCtx.sectionList,
      );
      highlightEmitter.emit('highlighted');
    },

    destroy() {
      view.destroy();
    },

    focus() { view.focus(); },

    toggleEditable(value) {
      const isEditable = value == null ? !view.state.facet(EditorView.editable) : !!value;
      view.dispatch({
        effects: editableCompartment.reconfigure(EditorView.editable.of(isEditable)),
      });
    },

    getContent() { return view.state.doc.toString(); },

    setContent(value, _noUndo) {
      const current = view.state.doc.toString();
      if (current === value) {
        return { start: 0, end: 0, range: null };
      }
      const startOffset = dmp.diff_commonPrefix(current, value);
      const endOffset = Math.min(
        dmp.diff_commonSuffix(current, value),
        current.length - startOffset,
        value.length - startOffset,
      );
      const replacement = value.substring(startOffset, value.length - endOffset);
      const fromIdx = startOffset;
      const toIdx = current.length - endOffset;
      view.dispatch({ changes: { from: fromIdx, to: toIdx, insert: replacement } });
      return { start: startOffset, end: value.length - endOffset, range: { from: fromIdx, to: toIdx } };
    },

    setSelection(start, end) {
      // cledit exposes editor.setSelection at the top level (not just on
      // selectionMgr). Pagedown's TextareaState.restore calls
      // `inputArea.setSelection(start, end)` directly — without this
      // shim the call throws "setSelection is not a function" and aborts
      // the post-button-click cursor restore.
      try {
        view.dispatch({ selection: EditorSelection.range(start, end) });
      } catch { /* out of range — ignore */ }
    },

    replace(start, end, replacement) {
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      view.dispatch({
        changes: { from: min, to: max, insert: replacement },
        selection: EditorSelection.cursor(min + replacement.length),
      });
    },

    adjustCursorPosition() {
      // cledit's adjustCursorPosition syncs DOM caret state into the
      // selectionMgr after content mutations. CM6 manages its own caret
      // state via transactions, so this is a no-op — but pagedown
      // (after wrap-style commands) calls it on the input. Keep the
      // method present so pagedown's flow doesn't abort.
    },

    replaceAll(search, replacement, startOffset = 0) {
      const text = view.state.doc.toString();
      const subtext = text.slice(startOffset);
      const value = (subtext as any).replace(search, replacement);
      if (value !== subtext) {
        const next = text.slice(0, startOffset) + value;
        const offset = bridge.setContent(next);
        view.dispatch({ selection: EditorSelection.cursor(offset.end) });
      }
    },

    addMarker(marker) {
      $markers[marker.id] = marker;
      view.dispatch({
        effects: addMarkerEffect.of({ id: marker.id, offset: marker.offset, trailing: marker.trailing }),
      });
      // marker.id is already assigned by Cm6Marker — no extra cm6Id sync needed.
      // Sync the offset back to marker.offset whenever the StateField updates.
      // Cheap polling via the updateListener — we already iterate markerField
      // entries on each transaction, so update marker.offset there too.
    },

    removeMarker(marker) {
      delete $markers[marker.id];
      view.dispatch({ effects: removeMarkerEffect.of(marker.id) });
    },

    addKeystroke(_k) { /* no-op for now — wave 6 wires CM6 keymaps */ },

    on(evt, fn) { editorEmitter.on(evt, fn); },
    off(evt, fn) { editorEmitter.off(evt, fn); },

    addClassRange(from, to, className, attrs) {
      return addClassRange(view, from, to, className, attrs);
    },
    removeClassRange(id) { removeClassRange(view, id); },
    updateClassRange(id, from, to, className) {
      updateClassRange(view, id, from, to, className);
    },
  };

  // Wire marker offset sync: every transaction, mirror the StateField
  // entries back to bridge.$markers[id].offset so external code that
  // reads marker.offset directly (e.g. discussion gutters) sees the
  // up-to-date value.
  view.dispatch({}); // no-op to ensure StateField is initialized
  view.dom.addEventListener('cm6-marker-sync', () => {});

  // We can't `view.update.listener` outside construction, so attach a
  // separate listener via dispatch(reconfigure(...)) — but simpler:
  // poll on each updateListener call using a compartment-free approach
  // by re-reading the field each time the bridge emits contentChanged.
  // Since the bridge already runs on doc-changed, sync there.
  const origEmit = editorEmitter.emit.bind(editorEmitter);
  editorEmitter.emit = (evt: string, ...args: any[]) => {
    if (evt === 'contentChanged') {
      const entries = view.state.field(markerField, false) || [];
      for (const e of entries as readonly MarkerEntry[]) {
        const m = $markers[e.id];
        if (m) m.offset = e.offset;
      }
    }
    origEmit(evt, ...args);
  };

  return bridge;
}

// Also expose under a `cledit`-compatible namespace so existing call
// sites that do `new cledit.Marker(...)` work after the swap with a
// single-line import change. Future batches will rewrite call sites
// to import Cm6Marker directly; this shim keeps the diff small.
export const cm6CleditCompat = {
  Marker: Cm6Marker,
};
