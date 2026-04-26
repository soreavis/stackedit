import { createItemStore } from './itemStoreFactory';
import empty from '../data/empties/emptySyncedContent';
import { useFileStore } from './file';

export const useSyncedContentStore = createItemStore('syncedContent', empty, true, {
  extraGetters: {
    current(state) {
      const currentFileId = useFileStore().current.id;
      return state.itemsById[`${currentFileId}/syncedContent`] || empty();
    },
  },
});
