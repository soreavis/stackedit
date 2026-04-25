// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';

// Stub the store import — customToolbarButtons.js pulls in the Vuex
// store (for textStats's modal/open dispatch), which transitively loads
// localDbSvc and reads localStorage at module init. The stub keeps the
// import graph minimal so the buttons themselves are loadable for static-
// shape inspection without standing up the whole app state.
vi.mock('../../../src/store', () => ({
  default: {
    dispatch: () => Promise.resolve(),
    commit: () => {},
    state: {},
    getters: {},
  },
}));

const customToolbarButtons = (await import('../../../src/data/customToolbarButtons.js')).default;
const customExports = await import('../../../src/data/customToolbarButtons.js');
const pagedownButtons = (await import('../../../src/data/pagedownButtons.js')).default;

// The toolbar surface is split between two data files:
//   - pagedownButtons.js: legacy buttons that flow through pagedown's
//     UIManager (bold, italic, link, etc).
//   - customToolbarButtons.js: post-fork additions whose `action` runs
//     directly on cledit (callout, math, mermaid, music, tidy, etc).
//
// These specs guard the shape of both arrays so a future refactor that
// renames a method or drops an icon trips the suite before the toolbar
// goes silent at runtime.

describe('pagedownButtons registry', () => {
  it('exports an array', () => {
    expect(Array.isArray(pagedownButtons)).toBe(true);
  });

  it('includes the core formatting actions', () => {
    const methods = pagedownButtons.filter(b => b.method).map(b => b.method);
    const required = ['bold', 'italic', 'heading', 'strikethrough', 'ulist', 'olist', 'clist'];
    required.forEach((m) => {
      expect(methods).toContain(m);
    });
  });

  it('every entry with a method has a title and icon', () => {
    pagedownButtons.filter(b => b.method).forEach((b) => {
      expect(typeof b.title).toBe('string');
      expect(b.title.length).toBeGreaterThan(0);
      expect(typeof b.icon).toBe('string');
      expect(b.icon.length).toBeGreaterThan(0);
    });
  });
});

describe('customToolbarButtons registry', () => {
  it('exports a default array', () => {
    expect(Array.isArray(customToolbarButtons)).toBe(true);
    expect(customToolbarButtons.length).toBeGreaterThan(0);
  });

  // Wave 1-4 features that should all be on the toolbar after the toolbar
  // expansion work landed. If a future refactor accidentally drops one,
  // this catches it before the button vanishes from the UI.
  const expectedMethods = [
    // Wave 1 — features StackEdit already supported via markdown-it but had
    // no UI affordance for.
    'inlineCode',
    'highlight',
    'subscript',
    'superscript',
    'horizontalRule',
    'math',
    'mermaid',
    'footnote',
    'music',
    'tidy',
    // Wave 2 — daily-use additions.
    'callout',
    'dateTime',
    'frontmatter',
    'convertCase',
    'sortLines',
    'specialChars',
    'wikiLink',
    'linkFromClipboard',
    // Wave 3 — image/table/stats.
    'imageWithSize',
    'tableInsert',
    'textStats',
  ];

  it.each(expectedMethods)('exposes %s', (method) => {
    const button = customToolbarButtons.find(b => b.method === method);
    expect(button).toBeTruthy();
  });

  it.each(expectedMethods)('%s has title + icon + at least one of action/items', (method) => {
    const button = customToolbarButtons.find(b => b.method === method);
    expect(typeof button.title).toBe('string');
    expect(button.title.length).toBeGreaterThan(0);
    expect(typeof button.icon).toBe('string');
    expect(button.icon.length).toBeGreaterThan(0);
    // Must have either an action() function (regular button) or
    // a dropdown items[] (dropdown picker).
    expect(typeof button.action === 'function' || Array.isArray(button.items)).toBe(true);
  });

  it('dropdown buttons mark `dropdown: true` and expose items[]', () => {
    const dropdowns = customToolbarButtons.filter(b => b.dropdown);
    expect(dropdowns.length).toBeGreaterThan(0);
    dropdowns.forEach((b) => {
      expect(Array.isArray(b.items)).toBe(true);
      expect(b.items.length).toBeGreaterThan(0);
      b.items.forEach((item) => {
        expect(typeof item.name).toBe('string');
        expect(typeof item.perform).toBe('function');
      });
    });
  });

  it('callout dropdown emits all 5 GFM alert types', () => {
    const callout = customExports.callout;
    expect(callout).toBeTruthy();
    expect(callout.dropdown).toBe(true);
    const names = callout.items.map(i => i.name);
    expect(names).toEqual(['Note', 'Tip', 'Important', 'Warning', 'Caution']);
  });

  it('convertCase exposes 6 case transforms', () => {
    const convertCase = customExports.convertCase;
    expect(convertCase).toBeTruthy();
    expect(convertCase.items.length).toBe(6);
    const names = convertCase.items.map(i => i.name);
    expect(names).toContain('UPPERCASE');
    expect(names).toContain('lowercase');
    expect(names).toContain('Title Case');
    expect(names).toContain('Sentence case');
    expect(names).toContain('snake_case');
    expect(names).toContain('kebab-case');
  });

  it('tableInsert exposes 5 preset sizes', () => {
    const tableInsert = customExports.tableInsert;
    expect(tableInsert).toBeTruthy();
    expect(tableInsert.items.length).toBe(5);
    const names = tableInsert.items.map(i => i.name);
    expect(names).toEqual(['2 × 2', '3 × 3', '4 × 3', '5 × 4', '10 × 4']);
  });

  it('specialChars exposes a non-trivial palette', () => {
    const specialChars = customExports.specialChars;
    expect(specialChars).toBeTruthy();
    expect(specialChars.items.length).toBeGreaterThanOrEqual(20);
  });

  it('tidy is marked separated (visual divider in toolbar)', () => {
    const tidy = customExports.tidy;
    expect(tidy).toBeTruthy();
    expect(tidy.separated).toBe(true);
  });

  it('all method names are unique within customToolbarButtons', () => {
    const methods = customToolbarButtons.map(b => b.method);
    const seen = new Set();
    methods.forEach((m) => {
      expect(seen.has(m)).toBe(false);
      seen.add(m);
    });
  });
});
