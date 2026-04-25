import { defineStore } from 'pinia';
import utils from '../services/utils';

// Pinia equivalent of src/store/moduleTemplate.js. Same shape: itemsById
// keyed by item.id, items getter returns Object.values, setItem /
// patchItem / deleteItem actions with the same hash semantics. Used by
// folder / syncedContent / contentState / file / content / etc.
//
// `simpleHash = true` uses Date.now() as the item hash (for not-synced
// types like contentState, syncedContent — saves running deepHash on
// every patch).
//
// `extraGetters` / `extraActions` let stores layer on module-specific
// extras (syncedContent's `current` getter, contentState's
// `patchCurrent` action, etc.) without losing the factory defaults.
//
// Returns a `useFooStore = defineStore(...)` factory function — call it
// inside your component / service to get the live store.
export function createItemStore(storeId, empty, simpleHash = false, {
  extraGetters = {},
  extraActions = {},
} = {}) {
  const hashFunc = simpleHash ? Date.now : item => utils.getItemHash(item);

  return defineStore(storeId, {
    state: () => ({
      itemsById: {},
    }),
    getters: {
      items: ({ itemsById }) => Object.values(itemsById),
      ...extraGetters,
    },
    actions: {
      setItem(value) {
        const item = Object.assign(empty(value.id), value);
        if (!item.hash || !simpleHash) {
          item.hash = hashFunc(item);
        }
        // Pinia + Vue 2.7 reactivity tracks deep keys via the underlying
        // Vue.observable / shallow ref system, so spreading a fresh
        // object onto itemsById preserves reactivity for downstream
        // getters/computed.
        this.itemsById = { ...this.itemsById, [item.id]: item };
      },
      patchItem(patch) {
        const item = this.itemsById[patch.id];
        if (item) {
          const updated = { ...item, ...patch };
          updated.hash = hashFunc(updated);
          this.itemsById = { ...this.itemsById, [item.id]: updated };
          return true;
        }
        return false;
      },
      deleteItem(id) {
        const next = { ...this.itemsById };
        delete next[id];
        this.itemsById = next;
      },
      ...extraActions,
    },
  });
}
