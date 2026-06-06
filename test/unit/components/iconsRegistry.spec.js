// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createApp } from 'vue';

// Vue 3: icons register on the app instance via app.use(icons) (the plugin's
// install() calls app.component(...) for every icon), not the old global
// Vue.component(). This spec verifies the registry is intact + the
// recently-added icons survive.
import icons from '../../../src/icons/index.js';

const app = createApp({});
app.use(icons);

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

  it.each(expected)('registers %s on the app', (name) => {
    // app.component(name) (single arg) returns the registered component when
    // the plugin registered it, or undefined otherwise — the regression signal.
    const ctor = app.component(name);
    expect(ctor).toBeTruthy();
  });
});
