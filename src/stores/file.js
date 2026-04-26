import { defineStore } from 'pinia';
import empty from '../data/empties/emptyFile';
import utils from '../services/utils';
import vuexStore from '../store';
import { useFolderStore } from './folder';
import { useDataStore } from './data';

// `file` doesn't reuse the itemStoreFactory because it adds currentId
// state, plus three custom getters (current, isCurrentTemp, lastOpened
// — the last one reads cross-store explorer.openNodes + data.lastOpenedIds).
// Inlining is clearer than parameterising the factory for one-off use.

const hashFunc = item => utils.getItemHash(item);

export const useFileStore = defineStore('file', {
  state: () => ({
    itemsById: {},
    currentId: null,
  }),
  getters: {
    items: ({ itemsById }) => Object.values(itemsById),
    current({ itemsById, currentId }) {
      return itemsById[currentId] || empty();
    },
    isCurrentTemp() {
      return this.current.parentId === 'temp';
    },
    lastOpened() {
      // Pick the most recent file that's (a) not in Trash and (b) reachable
      // without auto-expanding a currently-collapsed folder. The fallback
      // localDbSvc uses when currentId goes null; picking a file behind a
      // closed folder would pop it open in the explorer (disorienting).
      const openNodes = vuexStore.state.explorer ? vuexStore.state.explorer.openNodes : {};
      const foldersById = useFolderStore().itemsById;
      const isHidden = (file) => {
        let pid = file.parentId;
        while (pid && pid !== 'trash' && pid !== 'temp') {
          if (!openNodes[pid]) return true;
          const folder = foldersById[pid];
          if (!folder) return false;
          pid = folder.parentId;
        }
        return false;
      };
      const isUnderTrash = (file) => {
        let pid = file.parentId;
        while (pid) {
          if (pid === 'trash') return true;
          const folder = foldersById[pid];
          if (!folder) return false;
          pid = folder.parentId;
        }
        return false;
      };
      const acceptable = f => f && !isUnderTrash(f) && !isHidden(f);
      const ids = useDataStore().lastOpenedIds;
      for (let i = 0; i < ids.length; i += 1) {
        const f = this.itemsById[ids[i]];
        if (acceptable(f)) return f;
      }
      return this.items.find(acceptable) || empty();
    },
  },
  actions: {
    setItem(value) {
      const item = Object.assign(empty(value.id), value);
      if (!item.hash) {
        item.hash = hashFunc(item);
      }
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
    setCurrentId(value) {
      this.currentId = value;
    },
    patchCurrent(value) {
      this.patchItem({
        ...value,
        id: this.current.id,
      });
    },
  },
});
