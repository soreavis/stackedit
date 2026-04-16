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
