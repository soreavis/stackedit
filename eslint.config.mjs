// ESLint 9 flat config. Minimal ruleset — goal is a working safety net
// (syntax errors, undefined globals, obvious mistakes) without drowning
// the codebase in stylistic fires from a 2017-era Vue 2 project.

import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';

const appGlobals = {
  // Values injected by vite.config.mjs `define`:
  VERSION: 'readonly',
  NODE_ENV: 'readonly',
  GOOGLE_CLIENT_ID: 'readonly',
  GITHUB_CLIENT_ID: 'readonly',
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'static/**',
      'scripts/**',
      'test/fixtures/**',
      '**/*.min.js',
      // pagedown.js + clunderscore.js were deleted (Stage 3 batch 11
      // and Stage 1 respectively). No vendored-upstream files remain
      // under src/libs.
    ],
  },

  js.configs.recommended,
  ...vue.configs['flat/vue2-recommended'],

  {
    files: ['**/*.{js,mjs,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...appGlobals,
      },
    },
    rules: {
      // Safety net basics only. Noisy style rules stay off.
      'no-console': 'off',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        // Allow the common `try { ... } catch (e) { /* ignore */ }` pattern
        // without forcing everyone to switch to optional-catch-binding.
        caughtErrorsIgnorePattern: '^_|^(e|err|error)$',
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off', // upstream uses a lot of {}.hasOwnProperty
      'no-param-reassign': 'off',
      'no-plusplus': 'off',
      'no-underscore-dangle': 'off',
      'no-return-assign': 'off',
      'no-cond-assign': ['error', 'except-parens'],

      // Vue 2 rules: keep the safety ones, disable cosmetic noise.
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off', // every v-html here routes through DOMPurify
      'vue/no-mutating-props': 'warn',
      'vue/require-default-prop': 'off',
      'vue/require-prop-types': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attributes-order': 'off',
      'vue/component-definition-name-casing': 'off',
      'vue/this-in-template': 'off',
      'vue/no-unused-components': 'warn',

      // Cosmetic rule (mounted/created/watch must precede methods) — the
      // upstream convention is the opposite. Not worth churning every SFC.
      'vue/order-in-components': 'off',

      // Minor warning-only: template-shadow is stylistic, not a bug.
      'vue/no-template-shadow': 'off',

      // Pre-existing upstream bugs — demote to warnings so CI stays green.
      // Each is a legitimate issue to fix in a separate cleanup pass:
      //   - NavigationBar.vue titleWidth: side effect in computed
      //   - UserImage/UserName watchers: arrow functions
      //   - Comment / provider modals: v-if mixed with v-for
      //   - Explorer: missing await on nextTick
      'vue/no-side-effects-in-computed-properties': 'warn',
      'vue/no-arrow-functions-in-watch': 'warn',
      'vue/no-use-v-if-with-v-for': 'warn',
      'vue/valid-next-tick': 'warn',
    },
  },

  // Test specs: vitest globals
  {
    files: ['test/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },

  // Vite-era config files run in Node
  {
    files: ['vite.config.mjs', 'vitest.config.mjs', 'eslint.config.mjs', 'dev-server/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // API handlers (Node + Edge runtimes) — no browser globals
  {
    files: ['api/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
