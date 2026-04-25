// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import modalModule from '../../../src/store/modal.js';

// The modal Vuex module manages a stack of currently-open modals (so a
// nested confirm can appear over a settings dialog). Each `open` call
// pushes a config onto state.stack and returns a promise that resolves on
// "OK" / rejects on "Cancel". `getters.config` exposes the top of the
// stack as the modal currently rendered (unless `state.hidden`).

function buildStore() {
  // Vuex modules expose `actions` as ({ commit, state }, payload) => ... .
  // Build a tiny harness that mimics enough Vuex behavior to drive the
  // module without spinning up the full store + Vue.
  const state = JSON.parse(JSON.stringify({ stack: [], hidden: false }));
  const commit = (type, payload) => {
    if (modalModule.mutations[type]) {
      modalModule.mutations[type](state, payload);
    }
  };
  const getters = {};
  Object.entries(modalModule.getters || {}).forEach(([name, fn]) => {
    Object.defineProperty(getters, name, {
      get: () => fn(state),
      enumerable: true,
    });
  });
  return { state, commit, getters };
}

describe('modal store module', () => {
  it('starts with an empty stack and not hidden', () => {
    const { state, getters } = buildStore();
    expect(state.stack).toEqual([]);
    expect(state.hidden).toBe(false);
    expect(getters.config).toBeFalsy();
  });

  it('open() with a string normalizes to { type } config', async () => {
    const { state, commit, getters } = buildStore();
    const promise = modalModule.actions.open({ commit, state }, 'reset');
    expect(state.stack.length).toBe(1);
    expect(state.stack[0].type).toBe('reset');
    expect(getters.config.type).toBe('reset');
    // Resolving the config removes it from the stack.
    state.stack[0].resolve('ok');
    const result = await promise;
    expect(result).toBe('ok');
    expect(state.stack.length).toBe(0);
  });

  it('open() with an object spreads its fields onto the config', async () => {
    const { state, commit } = buildStore();
    const promise = modalModule.actions.open({ commit, state }, {
      type: 'folderDeletion',
      item: { name: 'Drafts' },
    });
    expect(state.stack[0].type).toBe('folderDeletion');
    expect(state.stack[0].item.name).toBe('Drafts');
    state.stack[0].resolve();
    await promise;
  });

  it('reject() rejects the promise and removes the config from the stack', async () => {
    const { state, commit } = buildStore();
    const promise = modalModule.actions.open({ commit, state }, 'reset');
    state.stack[0].reject(new Error('cancel'));
    await expect(promise).rejects.toThrow('cancel');
    expect(state.stack.length).toBe(0);
  });

  it('stacks modals — second open pushes to the top', async () => {
    const { state, commit, getters } = buildStore();
    const p1 = modalModule.actions.open({ commit, state }, 'first');
    const p2 = modalModule.actions.open({ commit, state }, 'second');
    expect(state.stack.length).toBe(2);
    // Stack-order convention: open() prepends, so newest is index 0.
    expect(getters.config.type).toBe('second');
    // Capture the config refs BEFORE resolving — calling resolve() on the
    // top-of-stack triggers a finally() that filters the resolved config
    // out of state.stack, so by the time we reach for state.stack[0]
    // again the indices have shifted.
    const config2 = state.stack[0];
    const config1 = state.stack[1];
    config2.resolve();
    config1.resolve();
    await Promise.all([p1, p2]);
    expect(state.stack.length).toBe(0);
  });

  it('hideUntil(promise) flips state.hidden during the awaited work', async () => {
    const { state, commit } = buildStore();
    let resolveInner;
    const inner = new Promise((res) => { resolveInner = res; });
    const wrapped = modalModule.actions.hideUntil({ commit }, inner);
    expect(state.hidden).toBe(true);
    resolveInner('done');
    const result = await wrapped;
    expect(result).toBe('done');
    expect(state.hidden).toBe(false);
  });

  it('hideUntil flips state.hidden back even if the inner promise rejects', async () => {
    const { state, commit } = buildStore();
    const inner = Promise.reject(new Error('boom'));
    await expect(modalModule.actions.hideUntil({ commit }, inner)).rejects.toThrow('boom');
    expect(state.hidden).toBe(false);
  });

  it('config getter respects state.hidden', () => {
    const { state, getters } = buildStore();
    state.stack = [{ type: 'foo' }];
    expect(getters.config.type).toBe('foo');
    state.hidden = true;
    expect(getters.config).toBeFalsy();
  });
});
