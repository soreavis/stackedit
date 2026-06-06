// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';

// localDbSvc reads localStorage at module-load (resetStackEdit check), which
// runs as the Modal import chain (Modal → syncSvc → localDbSvc) is evaluated —
// before happy-dom attaches it. Provide a minimal stub hoisted above imports.
vi.hoisted(() => {
  if (!globalThis.localStorage) {
    const store = {};
    globalThis.localStorage = {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => Object.keys(store).forEach(k => delete store[k]),
    };
  }
});

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Modal from '../../../src/components/Modal.vue';
import { useModalStore } from '../../../src/stores/modal.js';

// Regression guard for the Vue 3 migration: Modal.vue's template root is a
// <transition>, so this.$el is a placeholder COMMENT node (not the .modal
// element). The focus-trap called getTabbables(this.$el) →
// "container.querySelectorAll is not a function", which threw on open and
// left NO dialog rendered (every modal in the app). The fix reads a
// ref="modalEl" on the .modal element via $nextTick. This test opens a
// simple modal and asserts the element renders without the focus-trap error.
describe('Modal focus-trap (Vue 3 <transition>-root regression)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders the .modal element and traps focus without throwing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mount(Modal, { attachTo: document.body });

    // Nothing open initially → no .modal element.
    expect(wrapper.find('.modal').exists()).toBe(false);

    // Open a non-provider "simple" modal (renders the modal-inner branch with
    // a resolve button, i.e. a focusable/tabbable element).
    useModalStore().open('reset').catch(() => {});
    await wrapper.vm.$nextTick(); // render the .modal element
    await wrapper.vm.$nextTick(); // focus-trap runs on the tick after render

    // The bug: getTabbables(this.$el) threw and this never appeared.
    expect(wrapper.find('.modal').exists()).toBe(true);

    // And the focus-trap ran on the real element, not a comment node.
    const trapThrew = errSpy.mock.calls
      .flat()
      .some(arg => String(arg && (arg.message || arg)).includes('querySelectorAll'));
    expect(trapThrew).toBe(false);

    errSpy.mockRestore();
    wrapper.unmount();
  });
});
