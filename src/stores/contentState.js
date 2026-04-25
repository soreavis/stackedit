import { createItemStore } from './itemStoreFactory';
import empty from '../data/empties/emptyContentState';
import vuexStore from '../store';

export const useContentStateStore = createItemStore('contentState', empty, true, {
  extraGetters: {
    // file module still lives in Vuex during the transition.
    current(state) {
      const currentFileId = vuexStore.getters['file/current'].id;
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
