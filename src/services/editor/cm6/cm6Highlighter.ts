// Stage 3 batch 2 — CM6 highlight style for the markdown sandbox.
// Replaces the leaf's `defaultHighlightStyle` with a StackEdit-flavored
// mapping from @lezer/highlight tags to CSS so the sandbox visually
// renders headings, emphasis, code, links, lists, etc.
//
// Future batches will expand this to match the full StackEdit theme
// surface (currently driven by Prism + `markdownHighlighting.scss`).
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

const stackeditMarkdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.4em', fontWeight: '700', color: '#222' },
  { tag: t.heading2, fontSize: '1.25em', fontWeight: '700', color: '#222' },
  { tag: t.heading3, fontSize: '1.1em', fontWeight: '700', color: '#222' },
  { tag: t.heading4, fontWeight: '700', color: '#222' },
  { tag: t.heading5, fontWeight: '700', color: '#444' },
  { tag: t.heading6, fontWeight: '700', color: '#666' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: '#1976d2', textDecoration: 'underline' },
  { tag: t.url, color: '#1976d2' },
  { tag: t.monospace, fontFamily: 'var(--font-family-monospace, monospace)', background: 'rgba(0,0,0,0.06)', padding: '0 0.2em' },
  { tag: t.list, color: '#444' },
  { tag: t.quote, color: '#666', fontStyle: 'italic' },
  { tag: t.labelName, color: '#1976d2' },
  // The structural markers (e.g. the `#` in `# heading`, the `*` in `*em*`).
  // De-emphasised so the body stays readable while still making the
  // markup visible.
  { tag: t.processingInstruction, color: 'rgba(0,0,0,0.35)' },
]);

export function stackeditHighlight(): Extension {
  return syntaxHighlighting(stackeditMarkdownHighlightStyle, { fallback: true });
}
