import { defineStore } from 'pinia';
import utils from '../services/utils';

export interface BaseItem {
  id: string;
  type?: string;
  hash?: number;
  [key: string]: unknown;
}

export interface ItemStoreState<T extends BaseItem> {
  itemsById: Record<string, T>;
}

// Pinia getters/actions are heterogeneous — getters take state OR use
// `this`, actions take arbitrary args. Use `any` here so consumers can
// type their extras as concretely as they want without fighting
// contravariance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtraGetters = Record<string, (...args: any[]) => any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtraActions = Record<string, (...args: any[]) => any>;

interface CreateItemStoreOptions {
  extraGetters?: ExtraGetters;
  extraActions?: ExtraActions;
}

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
export function createItemStore<T extends BaseItem>(
  storeId: string,
  empty: (id?: string) => T,
  simpleHash = false,
  { extraGetters = {}, extraActions = {} }: CreateItemStoreOptions = {},
) {
  const hashFunc: (item: T) => number = simpleHash
    ? () => Date.now()
    : (item: T) => utils.getItemHash(item);

  return defineStore(storeId, {
    state: (): ItemStoreState<T> => ({
      itemsById: {},
    }),
    getters: {
      items(state): T[] {
        return Object.values(state.itemsById);
      },
      ...extraGetters,
    },
    actions: {
      setItem(value: Partial<T> & { id: string }): void {
        const item = Object.assign(empty(value.id), value) as T;
        if (!item.hash || !simpleHash) {
          item.hash = hashFunc(item);
        }
        // Pinia + Vue 2.7 reactivity tracks deep keys via the underlying
        // Vue.observable / shallow ref system, so spreading a fresh
        // object onto itemsById preserves reactivity for downstream
        // getters/computed.
        this.itemsById = { ...this.itemsById, [item.id]: item };
      },
      patchItem(patch: Partial<T> & { id: string }): boolean {
        const item = this.itemsById[patch.id];
        if (item) {
          const updated = { ...item, ...patch } as T;
          updated.hash = hashFunc(updated);
          this.itemsById = { ...this.itemsById, [item.id]: updated };
          return true;
        }
        return false;
      },
      deleteItem(id: string): void {
        const next = { ...this.itemsById };
        delete next[id];
        this.itemsById = next;
      },
      ...extraActions,
    },
  });
}
