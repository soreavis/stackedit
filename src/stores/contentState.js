import { createItemStore } from './itemStoreFactory';
import empty from '../data/empties/emptyContentState';
import { useFileStore } from './file';

export const useContentStateStore = createItemStore('contentState', empty, true, {
  extraGetters: {
    current(state) {
      const currentFileId = useFileStore().current.id;
      return state.itemsById[`${currentFileId}/contentState`] || empty();
    },
  },
  extraActions: {
    patchCurrent(value) {
      this.patchItem({
        ...value,
        id: this.current.id,
      });
    },
  },
});
