import Prism from 'prismjs';
import markdownitAbbr from 'markdown-it-abbr';
import markdownitDeflist from 'markdown-it-deflist';
import markdownitFootnote from 'markdown-it-footnote';
import markdownitMark from 'markdown-it-mark';
import markdownitImgsize from '../libs/markdownItImsize';
import markdownitSub from 'markdown-it-sub';
import markdownitSup from 'markdown-it-sup';
import markdownitTasklist from './libs/markdownItTasklist';
import markdownitAnchor from './libs/markdownItAnchor';
import extensionSvc from '../services/extensionSvc';

const coreBaseRules = [
  'normalize',
  'block',
  'inline',
  'linkify',
  'replacements',
  'smartquotes',
  // markdown-it 14 added `text_join` to merge consecutive text/text_special
  // tokens into a single text token. Required for escape sequences (`\*` etc.)
  // to render correctly. Was implicit before; explicitly listed now so the
  // pipeline stays deterministic if the upstream default ever flips.
  'text_join',
];
const blockBaseRules = [
  'code',
  'fence',
  'blockquote',
  'hr',
  'list',
  'reference',
  'heading',
  'lheading',
  'html_block',
  'table',
  'paragraph',
];
const inlineBaseRules = [
  'text',
  'newline',
  'escape',
  'backticks',
  'strikethrough',
  'emphasis',
  'link',
  'image',
  'autolink',
  'html_inline',
  'entity',
];
const inlineBaseRules2 = [
  'balance_pairs',
  'strikethrough',
  'emphasis',
  // markdown-it 14 renamed the old `text_collapse` post-process rule to
  // `fragments_join`. Same behavior — folds adjacent text fragments into
  // a single text token after delimiter resolution.
  'fragments_join',
];

extensionSvc.onGetOptions((options, properties) => Object
  .assign(options, properties.extensions.markdown));

extensionSvc.onInitConverter(0, (markdown, options) => {
  markdown.set({
    html: true,
    breaks: !!options.breaks,
    linkify: !!options.linkify,
    typographer: !!options.typographer,
    langPrefix: 'prism language-',
  });

  // markdown-it's `enable(rules)` only TURNS ON the listed rules — it
  // doesn't turn off rules that are already enabled (which is "all of
  // them" under the default preset). The original code tried to disable
  // optional rules (fence / table / strikethrough) by splicing them out
  // of the array passed to `enable()`, which was a no-op even when the
  // splice indices were correct. We use `disable()` for the opt-out
  // path now, which actually flips the rule's enabled flag off.
  markdown.core.ruler.enable(coreBaseRules);

  markdown.block.ruler.enable(blockBaseRules);
  if (!options.fence) {
    markdown.block.ruler.disable('fence');
  }
  if (!options.table) {
    markdown.block.ruler.disable('table');
  }

  markdown.inline.ruler.enable(inlineBaseRules);
  markdown.inline.ruler2.enable(inlineBaseRules2);
  if (!options.del) {
    markdown.inline.ruler.disable('strikethrough');
    markdown.inline.ruler2.disable('strikethrough');
  }

  if (options.abbr) {
    markdown.use(markdownitAbbr);
  }
  if (options.deflist) {
    markdown.use(markdownitDeflist);
  }
  if (options.footnote) {
    markdown.use(markdownitFootnote);
  }
  if (options.imgsize) {
    markdown.use(markdownitImgsize);
  }
  if (options.mark) {
    markdown.use(markdownitMark);
  }
  if (options.sub) {
    markdown.use(markdownitSub);
  }
  if (options.sup) {
    markdown.use(markdownitSup);
  }
  if (options.tasklist) {
    markdown.use(markdownitTasklist);
  }
  markdown.use(markdownitAnchor);

  // Wrap tables into a div for scrolling
  markdown.renderer.rules.table_open = (tokens, idx, opts) =>
    `<div class="table-wrapper">${markdown.renderer.renderToken(tokens, idx, opts)}`;
  markdown.renderer.rules.table_close = (tokens, idx, opts) =>
    `${markdown.renderer.renderToken(tokens, idx, opts)}</div>`;

  // Transform style into align attribute to pass the HTML sanitizer
  const textAlignLength = 'text-align:'.length;
  markdown.renderer.rules.td_open = (tokens, idx, opts) => {
    const token = tokens[idx];
    if (token.attrs && token.attrs.length && token.attrs[0][0] === 'style') {
      token.attrs = [
        ['align', token.attrs[0][1].slice(textAlignLength)],
      ];
    }
    return markdown.renderer.renderToken(tokens, idx, opts);
  };
  markdown.renderer.rules.th_open = markdown.renderer.rules.td_open;

  markdown.renderer.rules.footnote_ref = (tokens, idx) => {
    const n = `${Number(tokens[idx].meta.id + 1)}`;
    let id = `fnref${n}`;
    if (tokens[idx].meta.subId > 0) {
      id += `:${tokens[idx].meta.subId}`;
    }
    return `<sup class="footnote-ref"><a href="#fn${n}" id="${id}">${n}</a></sup>`;
  };
});

extensionSvc.onSectionPreview((elt, options, isEditor) => {
  // Highlight with Prism
  elt.querySelectorAll('.prism').forEach((prismElt) => {
    if (!prismElt.$highlightedWithPrism) {
      Prism.highlightElement(prismElt);
      prismElt.$highlightedWithPrism = true;
    }
  });

  // Transform task spans into checkboxes
  elt.querySelectorAll('span.task-list-item-checkbox').forEach((spanElt) => {
    const checkboxElt = document.createElement('input');
    checkboxElt.type = 'checkbox';
    checkboxElt.className = 'task-list-item-checkbox';
    if (spanElt.classList.contains('checked')) {
      checkboxElt.setAttribute('checked', true);
    }
    if (!isEditor) {
      checkboxElt.disabled = 'disabled';
    }
    spanElt.parentNode.replaceChild(checkboxElt, spanElt);
  });
});
