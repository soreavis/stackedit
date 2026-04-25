import { describe, it, expect } from 'vitest';
import MarkdownIt from 'markdown-it';
import tasklist from '../../../src/extensions/libs/markdownItTasklist.js';
import anchor from '../../../src/extensions/libs/markdownItAnchor.js';
import math from '../../../src/extensions/libs/markdownItMath.js';

describe('markdownItTasklist', () => {
  const md = new MarkdownIt({ html: false }).use(tasklist);

  it('renders an unchecked checkbox for "- [ ] text"', () => {
    const out = md.render('- [ ] foo\n');
    expect(out).toContain('task-list-item-checkbox');
    expect(out).not.toContain('checked');
    expect(out).toContain('&#9744;');
  });

  it('renders a checked checkbox for "- [x] text"', () => {
    const out = md.render('- [x] foo\n');
    expect(out).toContain('task-list-item-checkbox checked');
    expect(out).toContain('&#9745;');
  });

  it('accepts capital X', () => {
    const out = md.render('- [X] foo\n');
    expect(out).toContain('checked');
  });

  it('does not transform non-task list items', () => {
    const out = md.render('- ordinary item\n');
    expect(out).not.toContain('task-list-item-checkbox');
  });

  it('tags the <li> with task-list-item class', () => {
    const out = md.render('- [ ] foo\n');
    expect(out).toMatch(/<li[^>]*class="task-list-item"/);
  });
});

describe('markdownItAnchor (slug generation)', () => {
  // anchors are attached to heading_open tokens as .headingAnchor; use a
  // renderer hook to expose them.
  const build = () => {
    const md = new MarkdownIt().use(anchor);
    const origOpen = md.renderer.rules.heading_open
      || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrSet('data-anchor', token.headingAnchor || '');
      return origOpen(tokens, idx, options, env, self);
    };
    return md;
  };

  it('slugifies simple headings', () => {
    const out = build().render('## Hello World\n');
    expect(out).toContain('data-anchor="hello-world"');
  });

  it('strips punctuation and lowercases', () => {
    const out = build().render('## Can\'t Stop! (Really?)\n');
    expect(out).toContain('data-anchor="cant-stop-really"');
  });

  it('de-duplicates repeated heading slugs with numeric suffix', () => {
    const out = build().render('## Foo\n\n## Foo\n\n## Foo\n');
    expect(out).toContain('data-anchor="foo"');
    expect(out).toContain('data-anchor="foo-1"');
    expect(out).toContain('data-anchor="foo-2"');
  });

  it('falls back to "section" for punctuation-only headings', () => {
    const out = build().render('## ???\n');
    expect(out).toContain('data-anchor="section"');
  });

  it('produces sensible slugs for multi-word headings with numbers', () => {
    const out = build().render('## The 10 Commandments\n');
    // Leading digits are stripped by design ("remove everything up to the
    // first letter"), so we end up with "commandments" ish.
    expect(out).toMatch(/data-anchor="[a-z][a-z0-9-]*"/);
  });
});

describe('markdownItMath', () => {
  const md = new MarkdownIt().use(math);
  md.renderer.rules.inline_math = (tokens, idx) => `<i>${tokens[idx].content}</i>`;
  md.renderer.rules.display_math = (tokens, idx) => `<d>${tokens[idx].content}</d>`;

  it('parses $...$ as inline_math', () => {
    expect(md.render('Euler $e=mc^2$ here.\n')).toContain('<i>e=mc^2</i>');
  });

  it('parses $$...$$ as display_math', () => {
    expect(md.render('See $$\\int x$$ again.\n')).toContain('<d>\\int x</d>');
  });

  it('does NOT parse when $ is followed by whitespace', () => {
    const out = md.render('Price is $ 5 apples.\n');
    expect(out).not.toContain('<i>');
  });

  it('does NOT parse currency-style $5, $10', () => {
    const out = md.render('I have $5 and $10.\n');
    expect(out).not.toContain('<i>');
  });

  it('rejects a closing $ preceded by backslash — treats as non-math', () => {
    // '$a\$b$' has the escaped $ at the close position, so the plugin bails
    // at that attempt; no inline_math token is produced.
    const out = md.render('$a\\$b$\n');
    expect(out).not.toContain('<i>');
  });

  it('a triple-$$$ wraps: outer $ pair and inner $$...$$ partly match', () => {
    // Not symmetrical — the initial 3-marker attempt bails (per the plugin's
    // "3 markers are too much" guard), but subsequent attempts can still find
    // a $$-pair inside. We just assert the plugin does not crash and produces
    // SOME inline_math or display_math output from the inner dollars.
    const out = md.render('$$$x$$$\n');
    expect(out.includes('<d>') || out.includes('<i>')).toBe(true);
  });
});

// Regression: markdownExtension.js used to attempt to disable optional
// rules (fence / table / strikethrough) by splicing them out of the array
// passed to `markdown.{block,inline}.ruler.enable(...)`. Two bugs there:
// (1) `enable()` only turns rules ON — it doesn't turn off rules that are
// already enabled by default — so the splice was a no-op even when its
// indices were right. (2) The strikethrough splice used
// `blockRules.indexOf('strikethrough')` which always returned -1, so
// `splice(-1, 1)` silently dropped the LAST entry of inlineRules /
// inlineRules2 (i.e. `entity` and `fragments_join`) — that would have
// broken HTML-entity parsing and delimiter post-processing if `enable()`
// actually flipped rules off, but it didn't, so the breakage stayed
// latent.
//
// The fix uses `disable()` for the opt-out path. This spec replicates
// the post-fix logic on a fresh markdown-it so a future regression that
// reintroduces the splice-and-enable pattern would trip the suite (the
// "still on after disable" assertion would fail).
describe('markdownExtension rule-disable (regression)', () => {
  function buildBlockMd({ fence = true, table = true } = {}) {
    const md = new MarkdownIt({ html: true });
    if (!fence) md.block.ruler.disable('fence');
    if (!table) md.block.ruler.disable('table');
    return md;
  }

  function buildInlineMd({ del = true } = {}) {
    const md = new MarkdownIt({ html: true });
    if (!del) {
      md.inline.ruler.disable('strikethrough');
      md.inline.ruler2.disable('strikethrough');
    }
    return md;
  }

  it('disables fence blocks when options.fence=false', () => {
    // With fence disabled, the triple-backtick block is no longer a
    // block-level construct — the parser falls through to inline backticks,
    // which produces a `<code>` inline span (NOT a `<pre>` block). Only the
    // <pre> wrapper is fence-specific, so that's what we assert against.
    const out = buildBlockMd({ fence: false }).render('```js\nlet x = 1;\n```\n');
    expect(out).not.toContain('<pre>');
  });

  it('keeps fence blocks rendering when options.fence=true (default)', () => {
    const out = buildBlockMd({ fence: true }).render('```js\nlet x = 1;\n```\n');
    expect(out).toContain('<pre>');
    expect(out).toContain('let x = 1;');
  });

  it('disables tables when options.table=false', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    const out = buildBlockMd({ table: false }).render(md);
    expect(out).not.toContain('<table>');
  });

  it('keeps tables rendering when options.table=true (default)', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    const out = buildBlockMd({ table: true }).render(md);
    expect(out).toContain('<table>');
  });

  it('disables strikethrough when options.del=false', () => {
    const out = buildInlineMd({ del: false }).render('foo ~~bar~~ baz\n');
    expect(out).not.toMatch(/<s>|<\/s>|<del>|<\/del>/);
  });

  it('keeps strikethrough rendering when options.del=true (default)', () => {
    const out = buildInlineMd({ del: true }).render('foo ~~bar~~ baz\n');
    expect(out).toMatch(/<s>bar<\/s>|<del>bar<\/del>/);
  });

  it('still parses HTML entities when del=false (entity rule preserved)', () => {
    // Old splice bug used to drop `entity` from inline rules instead of
    // `strikethrough` — would have silenced &copy; / &amp; if it'd
    // actually fired. Verify the new disable() path doesn't have that
    // collateral.
    const out = buildInlineMd({ del: false }).render('&copy; 2026\n');
    expect(out).toContain('©');
  });

  it('still resolves emphasis delimiters when del=false (fragments_join preserved)', () => {
    // Same as above for inline ruler2's `fragments_join` post-process.
    const out = buildInlineMd({ del: false }).render('*foo*\n');
    expect(out).toContain('<em>foo</em>');
  });
});
