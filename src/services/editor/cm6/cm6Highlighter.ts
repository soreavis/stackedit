// CM6 highlight + block-decoration extension for StackEdit's markdown editor.
//
// Two cooperating layers:
// 1. `HighlightStyle` for inline tokens (emphasis, strong, link, processing
//    instructions, etc.) — these render as auto-classed spans inside a
//    `.cm-line`.
// 2. A `ViewPlugin` that walks the syntax tree and emits `Decoration.line`
//    for whole-line blocks (headings, fenced code, indented code) plus
//    `Decoration.mark` for inline code. We need block-level decorations
//    because the cledit-era styling sets per-line `font-size` /
//    `line-height` (`.h1`–`.h6` were 2em / 1.5em / 1.17em / 1em / 0.83em /
//    0.75em with `line-height: $line-height-title (1.33)`, and `.pre` was
//    monospace at $font-size-monospace (0.85em) with the same line-height).
//    Styling only the heading text span at the inline level keeps the
//    surrounding `.cm-line` at body line-height (1.67), which both looks
//    wrong and shifts editor section heights vs. the preview — breaking
//    `measureSectionDimensions`.
//
// Inline `InlineCode` gets a `cm6-mark-code` mark so we can paint the small
// rounded-background pill on it without that styling bleeding into the
// fenced-code body (which uses the line decoration instead).
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import {
  Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';

const stackeditMarkdownHighlightStyle = HighlightStyle.define([
  // Heading text colors only — sizes & line-heights live on the line
  // decoration so the whole `.cm-line` (including the `# ` marker) gets
  // the correct line-box height.
  { tag: t.heading1, color: '#222' },
  { tag: t.heading2, color: '#222' },
  { tag: t.heading3, color: '#222' },
  { tag: t.heading4, color: '#222' },
  { tag: t.heading5, color: '#444' },
  { tag: t.heading6, color: '#666' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: '#1976d2', textDecoration: 'underline' },
  { tag: t.url, color: '#1976d2' },
  { tag: t.list, color: '#444' },
  { tag: t.quote, color: '#666', fontStyle: 'italic' },
  { tag: t.labelName, color: '#1976d2' },
  // Structural markers (the `#` in `# heading`, the `*` in `*em*`, the
  // backticks around fences). De-emphasised so the body stays readable.
  { tag: t.processingInstruction, color: 'rgba(0,0,0,0.35)' },
  // YAML / generic-language tags — keep this style usable on the
  // settings YAML editor (CodeEditor.vue) and the comment editor too.
  // Without these mappings @codemirror/lang-yaml's parser still tags
  // tokens correctly but every token rendered with the default body
  // color (gray on gray), since `HighlightStyle.define` ignores tags
  // not present in its rule list. Picked colors echo Prism's
  // cledit-era YAML highlighting.
  { tag: t.propertyName, color: '#1976d2', fontWeight: '600' },
  { tag: t.string, color: '#388e3c' },
  { tag: t.number, color: '#0277bd' },
  { tag: t.bool, color: '#d32f2f' },
  { tag: t.null, color: '#d32f2f' },
  { tag: t.atom, color: '#d32f2f' },
  { tag: t.keyword, color: '#7b1fa2', fontWeight: '600' },
  { tag: t.comment, color: '#999', fontStyle: 'italic' },
  { tag: t.bracket, color: '#555' },
  { tag: t.punctuation, color: '#555' },
  { tag: t.operator, color: '#555' },
]);

// Map @codemirror/lang-markdown / @lezer/markdown block-node names to the
// line classes we apply via `Decoration.line`. Both ATX (`# foo`) and
// Setext (`foo\n===`) heading variants produce the same visual class.
const blockClass: Record<string, string> = {
  ATXHeading1: 'cm6-line-h1',
  ATXHeading2: 'cm6-line-h2',
  ATXHeading3: 'cm6-line-h3',
  ATXHeading4: 'cm6-line-h4',
  ATXHeading5: 'cm6-line-h5',
  ATXHeading6: 'cm6-line-h6',
  SetextHeading1: 'cm6-line-h1',
  SetextHeading2: 'cm6-line-h2',
  FencedCode: 'cm6-line-code',
  CodeBlock: 'cm6-line-code',
};

const lineDecoCache: Record<string, Decoration> = {};
function lineDeco(cls: string): Decoration {
  if (!lineDecoCache[cls]) lineDecoCache[cls] = Decoration.line({ class: cls });
  return lineDecoCache[cls];
}
const inlineCodeMark = Decoration.mark({ class: 'cm6-mark-code' });

function buildDecorations(view: EditorView): DecorationSet {
  type Entry = { from: number; to: number; value: Decoration; rank: number };
  const entries: Entry[] = [];
  // We iterate over the WHOLE document — not `view.visibleRanges` — so
  // every heading and fenced-code block carries its line decoration from
  // the moment the editor mounts. Iterating only visible ranges meant
  // each line decoration was applied lazily when the line scrolled into
  // view, which caused that line's measured height to jump (e.g. 30px
  // body → 48px h1) at the same moment, growing `scrollHeight` mid-
  // scroll. Section dimensions cached against the older scrollHeight
  // then drifted, and worst of all, the drift only kicked in deep in
  // the doc (where the user actually scrolled to) and never reset.
  // Walking the whole tree once costs O(n) over the parse tree, which
  // is essentially free for typical Markdown files.
  syntaxTree(view.state).iterate({
    enter: (node) => {
      const cls = blockClass[node.name];
      if (cls) {
        const startLine = view.state.doc.lineAt(node.from);
        const endLine = view.state.doc.lineAt(Math.min(node.to, view.state.doc.length));
        for (let n = startLine.number; n <= endLine.number; n += 1) {
          const line = view.state.doc.line(n);
          entries.push({ from: line.from, to: line.from, value: lineDeco(cls), rank: 0 });
        }
        // Heading bodies contain inline nodes (emphasis, link…) that we
        // want HighlightStyle to keep styling, so don't skip children
        // there. Code blocks have no useful inline structure for us.
        if (node.name === 'FencedCode' || node.name === 'CodeBlock') return false;
        return undefined;
      }
      if (node.name === 'InlineCode') {
        entries.push({ from: node.from, to: node.to, value: inlineCodeMark, rank: 1 });
      }
      return undefined;
    },
  });
  // RangeSetBuilder requires entries sorted by `from`, then by start-point
  // semantics (line decorations are point-decorations at line start, marks
  // are ranges). Sort by from, then rank so lines come before marks at the
  // same offset.
  entries.sort((a, b) => a.from - b.from || a.rank - b.rank || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const e of entries) builder.add(e.from, e.to, e.value);
  return builder.finish();
}

const blockHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(u: ViewUpdate): void {
      // Viewport changes alone no longer require a rebuild — the
      // decoration set covers the whole doc. We only rebuild when the
      // doc or syntax tree actually changes.
      if (u.docChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: v => v.decorations },
);

// Per-line and per-mark CSS for the decorations above. `.cm-line.cm6-*`
// selectors override the universal `* { line-height: 1.67 }` from
// base.scss because class specificity (0,2,0) beats `*` (0,0,0). Heading
// font-sizes track the cledit-era `markdownHighlighting.scss` exactly.
const blockTheme = EditorView.theme({
  '.cm-line.cm6-line-h1': { fontSize: '2em', fontWeight: '700', lineHeight: '1.33' },
  '.cm-line.cm6-line-h2': { fontSize: '1.5em', fontWeight: '700', lineHeight: '1.33' },
  '.cm-line.cm6-line-h3': { fontSize: '1.17em', fontWeight: '700', lineHeight: '1.33' },
  '.cm-line.cm6-line-h4': { fontSize: '1em', fontWeight: '700', lineHeight: '1.33' },
  '.cm-line.cm6-line-h5': { fontSize: '0.83em', fontWeight: '700', lineHeight: '1.33' },
  '.cm-line.cm6-line-h6': { fontSize: '0.75em', fontWeight: '700', lineHeight: '1.33' },
  '.cm-line.cm6-line-h1 *, .cm-line.cm6-line-h2 *, .cm-line.cm6-line-h3 *, .cm-line.cm6-line-h4 *, .cm-line.cm6-line-h5 *, .cm-line.cm6-line-h6 *': {
    lineHeight: '1.33',
  },
  '.cm-line.cm6-line-code': {
    fontFamily: 'var(--font-family-monospace, "Roboto Mono", "Lucida Console", monospace)',
    fontSize: '0.85em',
    lineHeight: '1.33',
  },
  '.cm-line.cm6-line-code *': {
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: '1.33',
  },
  '.cm6-mark-code': {
    fontFamily: 'var(--font-family-monospace, "Roboto Mono", "Lucida Console", monospace)',
    fontSize: '0.85em',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: '3px',
    padding: '0.1em 0.25em',
  },
});

export function stackeditHighlight(): Extension {
  return [
    syntaxHighlighting(stackeditMarkdownHighlightStyle, { fallback: true }),
    blockHighlightPlugin,
    blockTheme,
  ];
}
