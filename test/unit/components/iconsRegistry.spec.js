// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import Vue from 'vue';

// Loading src/icons/index.js calls Vue.component(...) for every icon. This
// spec verifies the registry is intact + the recently-added icons survive.
import '../../../src/icons/index.js';

describe('icon registry', () => {
  // Spot-check the bundled icon set. If a future refactor accidentally drops
  // an icon's registration line, this test catches it before the UI breaks.
  const expected = [
    'iconChevronUp',
    'iconChevronDown',
    'iconLanguageMarkdown',
    'iconLanguageHtml5',
    'iconFolder',
    'iconClose',
    'iconSettings',
    'iconFormatBold',
    'iconFormatSize',
    'iconTable',
    'iconCodeTags',
    'iconProvider',
  ];

  it.each(expected)('registers %s globally', (name) => {
    // Vue.component(name) returns the registered component constructor when
    // the name was previously registered with the same call form. If not
    // registered, the call returns undefined — that's the regression signal.
    const ctor = Vue.component(name);
    expect(ctor).toBeTruthy();
  });
});
