import { createItemStore, BaseItem } from './itemStoreFactory';
import emptyFolderRaw from '../data/empties/emptyFolder';

export interface Folder extends BaseItem {
  type?: string;
  name: string;
  parentId: string | null;
  hash: number;
}

const emptyFolder = emptyFolderRaw as unknown as (id?: string) => Folder;

export const useFolderStore = createItemStore<Folder>('folder', emptyFolder);
