import { createItemStore, BaseItem, ItemStoreState } from './itemStoreFactory';
import emptyContentStateRaw from '../data/empties/emptyContentState';
import { useFileStore } from './file';

export interface ContentState extends BaseItem {
  type?: string;
  selectionStart: number;
  selectionEnd: number;
  scrollPosition: number | null;
  hash: number;
}

const emptyContentState = emptyContentStateRaw as unknown as (id?: string) => ContentState;

export const useContentStateStore = createItemStore<ContentState>('contentState', emptyContentState, true, {
  extraGetters: {
    current(state: ItemStoreState<ContentState>): ContentState {
      const currentFileId = useFileStore().current.id;
      return state.itemsById[`${currentFileId}/contentState`] || emptyContentState();
    },
  },
  extraActions: {
    patchCurrent(value: Partial<ContentState>): void {
      // `this` is the resulting Pinia store; cast through unknown so the
      // factory's loose ExtraActions signature still type-checks at the
      // call site.
      const self = this as unknown as {
        current: ContentState;
        patchItem: (patch: Partial<ContentState> & { id: string }) => boolean;
      };
      self.patchItem({
        ...value,
        id: self.current.id,
      });
    },
  },
});
