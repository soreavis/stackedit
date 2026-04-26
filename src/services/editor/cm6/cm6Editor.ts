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
import { bracketMatching } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { markdown } from '@codemirror/lang-markdown';
import { stackeditHighlight } from './cm6Highlighter';
import { markerField } from './cm6Marker';
import { classRangeField } from './cm6Decorations';

export { isCm6FlagEnabled } from './cm6Flag';
export { parseSectionsForCm6 } from './cm6SectionParser';
export type { SectionEntry } from './cm6SectionParser';
export {
  markerField,
  addMarkerEffect,
  removeMarkerEffect,
  addMarker,
  removeMarker,
  getMarkers,
  getMarkerOffset,
} from './cm6Marker';
export type { MarkerEntry } from './cm6Marker';
export {
  getSelection,
  setSelection,
  hasFocus,
  focusEditor,
} from './cm6Selection';
export type { SelectionRange } from './cm6Selection';
export {
  wrapSelection,
  insertBlock,
  insertText,
  transformLines,
  transformSelection,
  cm6Commands,
  boldCommand,
  italicCommand,
  inlineCodeCommand,
  highlightCommand,
  subscriptCommand,
  superscriptCommand,
  strikethroughCommand,
  horizontalRuleCommand,
  mathCommand,
  mermaidCommand,
  musicCommand,
  calloutCommand,
  calloutNoteCommand,
  calloutTipCommand,
  calloutImportantCommand,
  calloutWarningCommand,
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
  SPECIAL_CHARS,
  specialCharCommand,
  wikiLinkCommand,
  imageWithSizeCommand,
  buildTable,
  tableInsertCommand,
  table2x2Command,
  table3x3Command,
  table4x3Command,
  table5x4Command,
  table10x4Command,
  prefixLines,
  ulistCommand,
  olistCommand,
  clistCommand,
  quoteCommand,
  codeCommand,
  headingCommand,
  heading1Command,
  heading2Command,
  heading3Command,
  heading4Command,
  heading5Command,
  heading6Command,
  linkCommand,
  imageCommand,
} from './cm6Commands';
export type {
  Cm6Command, WrapOptions, CalloutType,
} from './cm6Commands';
export {
  createCm6ClEditorBridge,
  Cm6Marker,
  cm6CleditCompat,
} from './cm6ClEditorBridge';
export type {
  Cm6ClEditorBridge,
  BridgeInitOptions,
} from './cm6ClEditorBridge';
export {
  classRangeField,
  addClassRangeEffect,
  removeClassRangeEffect,
  updateClassRangeEffect,
  addClassRange,
  removeClassRange,
  updateClassRange,
  getClassRangeEntries,
} from './cm6Decorations';
export type { ClassRangeEntry } from './cm6Decorations';

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
    stackeditHighlight(),
    markdown(),
    markerField,
    classRangeField,
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

