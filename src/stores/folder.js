import { createItemStore } from './itemStoreFactory';
import empty from '../data/empties/emptyFolder';

export const useFolderStore = createItemStore('folder', empty);
