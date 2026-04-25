// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useModalStore } from '../../../src/stores/modal.js';

// The modal Pinia store manages a stack of currently-open modals (so a
// nested confirm can appear over a settings dialog). Each `open` call
// pushes a config onto state.stack and returns a promise that resolves on
// "OK" / rejects on "Cancel". `getters.config` exposes the top of the
// stack as the modal currently rendered (unless `state.hidden`).

describe('modal Pinia store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts with an empty stack and not hidden', () => {
    const store = useModalStore();
    expect(store.stack).toEqual([]);
    expect(store.hidden).toBe(false);
    expect(store.config).toBeFalsy();
  });

  it('open() with a string normalizes to { type } config', async () => {
    const store = useModalStore();
    const promise = store.open('reset');
    expect(store.stack.length).toBe(1);
    expect(store.stack[0].type).toBe('reset');
    expect(store.config.type).toBe('reset');
    // Resolving the config removes it from the stack.
    store.stack[0].resolve('ok');
    const result = await promise;
    expect(result).toBe('ok');
    expect(store.stack.length).toBe(0);
  });

  it('open() with an object spreads its fields onto the config', async () => {
    const store = useModalStore();
    const promise = store.open({
      type: 'folderDeletion',
      item: { name: 'Drafts' },
    });
    expect(store.stack[0].type).toBe('folderDeletion');
    expect(store.stack[0].item.name).toBe('Drafts');
    store.stack[0].resolve();
    await promise;
  });

  it('reject() rejects the promise and removes the config from the stack', async () => {
    const store = useModalStore();
    const promise = store.open('reset');
    store.stack[0].reject(new Error('cancel'));
    await expect(promise).rejects.toThrow('cancel');
    expect(store.stack.length).toBe(0);
  });

  it('stacks modals — second open pushes to the top', async () => {
    const store = useModalStore();
    const p1 = store.open('first');
    const p2 = store.open('second');
    expect(store.stack.length).toBe(2);
    // Stack-order convention: open() prepends, so newest is index 0.
    expect(store.config.type).toBe('second');
    // Capture the config refs BEFORE resolving — calling resolve() on the
    // top-of-stack triggers a finally() that filters the resolved config
    // out of state.stack, so by the time we reach for state.stack[0]
    // again the indices have shifted.
    const config2 = store.stack[0];
    const config1 = store.stack[1];
    config2.resolve();
    config1.resolve();
    await Promise.all([p1, p2]);
    expect(store.stack.length).toBe(0);
  });

  it('hideUntil(promise) flips state.hidden during the awaited work', async () => {
    const store = useModalStore();
    let resolveInner;
    const inner = new Promise((res) => { resolveInner = res; });
    const wrapped = store.hideUntil(inner);
    expect(store.hidden).toBe(true);
    resolveInner('done');
    const result = await wrapped;
    expect(result).toBe('done');
    expect(store.hidden).toBe(false);
  });

  it('hideUntil flips state.hidden back even if the inner promise rejects', async () => {
    const store = useModalStore();
    const inner = Promise.reject(new Error('boom'));
    await expect(store.hideUntil(inner)).rejects.toThrow('boom');
    expect(store.hidden).toBe(false);
  });

  it('config getter respects state.hidden', () => {
    const store = useModalStore();
    store.stack = [{ type: 'foo' }];
    expect(store.config.type).toBe('foo');
    store.hidden = true;
    expect(store.config).toBeFalsy();
  });
});
