import { createItemStore } from './itemStoreFactory';
import empty from '../data/empties/emptySyncedContent';
import vuexStore from '../store';

export const useSyncedContentStore = createItemStore('syncedContent', empty, true, {
  extraGetters: {
    // file module still lives in Vuex during the transition.
    current(state) {
      const currentFileId = vuexStore.getters['file/current'].id;
      return state.itemsById[`${currentFileId}/syncedContent`] || empty();
    },
  },
});
