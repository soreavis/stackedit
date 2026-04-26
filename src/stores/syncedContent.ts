import { createItemStore, BaseItem, ItemStoreState } from './itemStoreFactory';
import emptySyncedContentRaw from '../data/empties/emptySyncedContent';
import { useFileStore } from './file';

export interface SyncedContent extends BaseItem {
  type?: string;
  historyData: Record<string, unknown>;
  syncHistory: Record<string, unknown>;
  v: number;
  hash: number;
}

const emptySyncedContent = emptySyncedContentRaw as unknown as (id?: string) => SyncedContent;

export const useSyncedContentStore = createItemStore<SyncedContent>('syncedContent', emptySyncedContent, true, {
  extraGetters: {
    current(state: ItemStoreState<SyncedContent>): SyncedContent {
      const currentFileId = useFileStore().current.id;
      return state.itemsById[`${currentFileId}/syncedContent`] || emptySyncedContent();
    },
  },
});
