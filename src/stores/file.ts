import { defineStore } from 'pinia';
import emptyFileRaw from '../data/empties/emptyFile';
import utils from '../services/utils';
import { useFolderStore, Folder } from './folder';
import { useDataStore } from './data';
import { useExplorerStore } from './explorer';
import { BaseItem } from './itemStoreFactory';

export interface FileItem extends BaseItem {
  type?: string;
  name: string;
  parentId: string | null;
  hash: number;
}

interface FileState {
  itemsById: Record<string, FileItem>;
  currentId: string | null;
}

const emptyFile = emptyFileRaw as unknown as (id?: string) => FileItem;

const hashFunc = (item: FileItem): number => utils.getItemHash(item);

// `file` doesn't reuse the itemStoreFactory because it adds currentId
// state, plus three custom getters (current, isCurrentTemp, lastOpened
// — the last one reads cross-store explorer.openNodes + data.lastOpenedIds).
// Inlining is clearer than parameterising the factory for one-off use.

export const useFileStore = defineStore('file', {
  state: (): FileState => ({
    itemsById: {},
    currentId: null,
  }),
  getters: {
    items(state): FileItem[] {
      return Object.values(state.itemsById);
    },
    current(state): FileItem {
      const id = state.currentId;
      return (id && state.itemsById[id]) || emptyFile();
    },
    isCurrentTemp(): boolean {
      return this.current.parentId === 'temp';
    },
    lastOpened(): FileItem {
      // Pick the most recent file that's (a) not in Trash and (b) reachable
      // without auto-expanding a currently-collapsed folder. The fallback
      // localDbSvc uses when currentId goes null; picking a file behind a
      // closed folder would pop it open in the explorer (disorienting).
      const openNodes = (useExplorerStore() as any).openNodes as Record<string, boolean>;
      const foldersById = useFolderStore().itemsById as Record<string, Folder>;
      const isHidden = (file: FileItem): boolean => {
        let pid: string | null = file.parentId;
        while (pid && pid !== 'trash' && pid !== 'temp') {
          if (!openNodes[pid]) return true;
          const folder = foldersById[pid];
          if (!folder) return false;
          pid = folder.parentId;
        }
        return false;
      };
      const isUnderTrash = (file: FileItem): boolean => {
        let pid: string | null = file.parentId;
        while (pid) {
          if (pid === 'trash') return true;
          const folder = foldersById[pid];
          if (!folder) return false;
          pid = folder.parentId;
        }
        return false;
      };
      const acceptable = (f: FileItem | undefined): boolean =>
        !!f && !isUnderTrash(f) && !isHidden(f);
      const ids = (useDataStore() as any).lastOpenedIds as string[];
      for (let i = 0; i < ids.length; i += 1) {
        const f = this.itemsById[ids[i]];
        if (acceptable(f)) return f;
      }
      return this.items.find(acceptable) || emptyFile();
    },
  },
  actions: {
    setItem(value: Partial<FileItem> & { id: string }): void {
      const item = Object.assign(emptyFile(value.id), value) as FileItem;
      if (!item.hash) {
        item.hash = hashFunc(item);
      }
      this.itemsById = { ...this.itemsById, [item.id]: item };
    },
    patchItem(patch: Partial<FileItem> & { id: string }): boolean {
      const item = this.itemsById[patch.id];
      if (item) {
        const updated = { ...item, ...patch };
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
    setCurrentId(value: string | null): void {
      this.currentId = value;
    },
    patchCurrent(value: Partial<FileItem>): void {
      this.patchItem({
        ...value,
        id: this.current.id,
      });
    },
  },
});
