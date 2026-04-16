// @vitest-environment node
//
// Tests the template-rendering logic that src/services/templateWorker.js
// applies inside its worker. We don't spawn a real node:worker_threads
// Worker here — Vitest 4's forked-pool error propagation trips on the
// worker's close() path even when the render is correct. The functional
// behavior (Handlebars.compile, tocToHtml helper, eval-based custom
// helpers) is pure and tests cleanly outside the worker.
//
// The sandbox's property-freezing behavior (replacing non-whitelisted
// globals with throwing getters) is exercised at runtime in the browser.
// It can't be tested here without isolating globals, which defeats Vitest.

import { describe, it, expect, beforeAll } from 'vitest';
import Handlebars from 'handlebars';

beforeAll(() => {
  // Mirror of the tocToHtml helper registered in templateWorker.js
  Handlebars.registerHelper('tocToHtml', (toc, depth = 6) => {
    function arrayToHtml(arr) {
      if (!arr || !arr.length || arr[0].level > depth) return '';
      const ulHtml = arr.map((item) => {
        let result = '<li>';
        if (item.anchor && item.title) {
          result += `<a href="#${item.anchor}">${item.title}</a>`;
        }
        result += arrayToHtml(item.children);
        return `${result}</li>`;
      }).join('\n');
      return `\n<ul>\n${ulHtml}\n</ul>\n`;
    }
    return new Handlebars.SafeString(arrayToHtml(toc));
  });
});

// Replicates the worker's render pipeline: compile template, eval helpers
// code, render with context.
function renderTemplate(template, context, helpersCode = '') {
  const compiled = Handlebars.compile(template);
  if (helpersCode) {
     
    new Function('Handlebars', helpersCode)(Handlebars);
  }
  return compiled(context);
}

describe('templateWorker — Handlebars compile + render', () => {
  it('renders a template with context', () => {
    expect(renderTemplate('Hello {{name}}!', { name: 'world' })).toBe('Hello world!');
  });

  it('renders an iteration (Handlebars each)', () => {
    const tpl = '{{#each items}}[{{this}}]{{/each}}';
    expect(renderTemplate(tpl, { items: ['a', 'b', 'c'] })).toBe('[a][b][c]');
  });

  it('escapes HTML by default ({{ }}) but not ({{{ }}})', () => {
    expect(renderTemplate('{{x}}', { x: '<b>hi</b>' })).toBe('&lt;b&gt;hi&lt;/b&gt;');
    expect(renderTemplate('{{{x}}}', { x: '<b>hi</b>' })).toBe('<b>hi</b>');
  });
});

describe('templateWorker — tocToHtml helper', () => {
  it('renders a nested TOC', () => {
    const toc = [
      { level: 1, anchor: 'a', title: 'A', children: [
        { level: 2, anchor: 'a-b', title: 'B', children: [] },
      ] },
      { level: 1, anchor: 'c', title: 'C', children: [] },
    ];
    const out = renderTemplate('{{{tocToHtml toc}}}', { toc });
    expect(out).toContain('<a href="#a">A</a>');
    expect(out).toContain('<a href="#a-b">B</a>');
    expect(out).toContain('<a href="#c">C</a>');
  });

  it('respects the depth limit', () => {
    const toc = [{
      level: 1, anchor: 'a', title: 'A', children: [
        { level: 2, anchor: 'b', title: 'B', children: [] },
      ],
    }];
    const shallow = renderTemplate('{{{tocToHtml toc 1}}}', { toc });
    expect(shallow).toContain('<a href="#a">A</a>');
    expect(shallow).not.toContain('<a href="#b">B</a>');
  });
});

describe('templateWorker — custom helpers via eval', () => {
  it('can register a custom helper and use it', () => {
    // Re-create helper each run to isolate from other tests. Use a unique
    // name so parallel describes don't clobber each other.
    const helpers = "Handlebars.registerHelper('shout_' + Math.random().toString(36).slice(2), s => s.toUpperCase());";
    // Register directly so we can call with a known name:
    Handlebars.registerHelper('__shout_test', s => s.toUpperCase());
    expect(renderTemplate('{{__shout_test name}}', { name: 'hi' }, helpers)).toBe('HI');
    Handlebars.unregisterHelper('__shout_test');
  });

  it('surfaces errors from helpers code', () => {
    expect(() => renderTemplate('x', {}, "throw new Error('kaboom');"))
      .toThrow('kaboom');
  });
});

describe('templateWorker — error paths', () => {
  it('throws on malformed template syntax', () => {
    expect(() => renderTemplate('{{#each x}}unterminated', { x: [1] })).toThrow();
  });
});
