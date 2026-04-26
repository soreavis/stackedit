// Stage 3 batch 1 — leaf module proving the CM6 stack mounts in this app.
// Cledit still drives the live editor; this file is wired in only when the
// `?cm6=1` query param is present, via Editor.vue's sandbox div.
//
// Future batches (selection bridge, marker decorations, toolbar commands,
// scroll sync) will replace cledit by reusing this builder and extending
// the extension list.
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { markdown } from '@codemirror/lang-markdown';

export { isCm6FlagEnabled } from './cm6Flag';

export interface Cm6Handle {
  view: EditorView;
  dispose: () => void;
}

export interface Cm6Options {
  doc?: string;
  extraExtensions?: Extension[];
}

function baseExtensions(): Extension[] {
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
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    markdown(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
  ];
}

export function mountCm6Editor(parent: HTMLElement, options: Cm6Options = {}): Cm6Handle {
  const { doc = '', extraExtensions = [] } = options;
  const state = EditorState.create({
    doc,
    extensions: [...baseExtensions(), ...extraExtensions],
  });
  const view = new EditorView({ state, parent });
  return {
    view,
    dispose: () => view.destroy(),
  };
}

