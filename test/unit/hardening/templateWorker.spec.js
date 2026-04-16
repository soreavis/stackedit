// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const harness = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/templateWorkerHarness.mjs',
);

// One round-trip: post [template, context, helpersCode] and await the reply.
// templateWorker.js calls close() after each message, so we spawn a fresh
// Worker per call to keep the harness simple.
function runTemplate(template, context, helpers = '') {
  return new Promise((resolve, reject) => {
    const w = new Worker(harness);
    const to = setTimeout(() => {
      w.terminate();
      reject(new Error('worker timeout'));
    }, 5000);
    w.once('message', (data) => {
      clearTimeout(to);
      w.terminate();
      resolve(data);
    });
    w.once('error', (e) => {
      clearTimeout(to);
      w.terminate();
      reject(e);
    });
    w.postMessage([template, context, helpers]);
  });
}

describe('templateWorker — happy path', () => {
  it('renders a Handlebars template with context', async () => {
    const [err, result] = await runTemplate('Hello {{name}}!', { name: 'world' });
    expect(err).toBeNull();
    expect(result).toBe('Hello world!');
  });

  it('renders an iteration (Handlebars each)', async () => {
    const tpl = '{{#each items}}[{{this}}]{{/each}}';
    const [err, result] = await runTemplate(tpl, { items: ['a', 'b', 'c'] });
    expect(err).toBeNull();
    expect(result).toBe('[a][b][c]');
  });

  it('escapes HTML by default ({{ }}) but not ({{{ }}})', async () => {
    const [, escaped] = await runTemplate('{{x}}', { x: '<b>hi</b>' });
    expect(escaped).toBe('&lt;b&gt;hi&lt;/b&gt;');
    const [, raw] = await runTemplate('{{{x}}}', { x: '<b>hi</b>' });
    expect(raw).toBe('<b>hi</b>');
  });
});

describe('templateWorker — registered helpers', () => {
  it('tocToHtml renders a nested TOC', async () => {
    const toc = [
      { level: 1, anchor: 'a', title: 'A', children: [
        { level: 2, anchor: 'a-b', title: 'B', children: [] },
      ] },
      { level: 1, anchor: 'c', title: 'C', children: [] },
    ];
    const tpl = '{{{tocToHtml toc}}}';
    const [err, result] = await runTemplate(tpl, { toc });
    expect(err).toBeNull();
    expect(result).toContain('<a href="#a">A</a>');
    expect(result).toContain('<a href="#a-b">B</a>');
    expect(result).toContain('<a href="#c">C</a>');
  });

  it('tocToHtml respects depth limit', async () => {
    const toc = [{
      level: 1, anchor: 'a', title: 'A', children: [
        { level: 2, anchor: 'b', title: 'B', children: [] },
      ],
    }];
    const [, shallow] = await runTemplate('{{{tocToHtml toc 1}}}', { toc });
    expect(shallow).toContain('<a href="#a">A</a>');
    expect(shallow).not.toContain('<a href="#b">B</a>');
  });
});

describe('templateWorker — helpers code (custom helpers via eval)', () => {
  it('can register a custom helper and use it in the template', async () => {
    const helpers = "Handlebars.registerHelper('shout', s => s.toUpperCase());";
    const [err, result] = await runTemplate('{{shout name}}', { name: 'hi' }, helpers);
    expect(err).toBeNull();
    expect(result).toBe('HI');
  });

  it('reports an error when helpers code throws', async () => {
    const helpers = "throw new Error('kaboom');";
    const [err, result] = await runTemplate('x', {}, helpers);
    expect(err).toContain('kaboom');
    expect(result).toBeUndefined();
  });
});

describe('templateWorker — error paths', () => {
  it('reports an error for malformed template syntax', async () => {
    const [err, result] = await runTemplate('{{#each x}}unterminated', { x: [1] });
    expect(err).toBeTruthy();
    expect(result).toBeUndefined();
  });
});

describe('templateWorker — sandbox', () => {
  it('blocks access to non-whitelisted globals from helpers code', async () => {
    // `process` is a Node global that the sandbox should have replaced with a
    // throwing getter (globalThis is walked during module init). Accessing it
    // from helpers code must surface as an error message, not a crash.
    const helpers = 'void process.env;';
    const [err] = await runTemplate('x', {}, helpers);
    expect(err).toBeTruthy();
    expect(String(err)).toMatch(/Security Exception|cannot access/i);
  });

  it('still allows access to whitelisted globals (JSON, Math)', async () => {
    const helpers = "Handlebars.registerHelper('pi', () => JSON.stringify(Math.PI));";
    const [err, result] = await runTemplate('{{pi}}', {}, helpers);
    expect(err).toBeNull();
    expect(result).toContain('3.14');
  });
});
