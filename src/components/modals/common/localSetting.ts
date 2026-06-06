import { useDataStore } from '../../../stores/data';

/**
 * A writable computed bound to a key in the data store's `localSettings`.
 * Replaces the old `computedLocalSettings: { foo: 'id' }` runtime magic with an
 * explicit, type-visible declaration:
 *
 *   computed: { foo: localSetting('id') }
 *
 * `localSettings` values are `unknown`, so the bound value is `any` for
 * ergonomic template/v-model use.
 */
export function localSetting(id: string) {
  return {
    get(): any {
      return useDataStore().localSettings[id];
    },
    set(value: any): void {
      useDataStore().patchLocalSettings({ [id]: value });
    },
  };
}
