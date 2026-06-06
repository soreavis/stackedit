import utils from '../utils';
import { useSyncLocationStore } from '../../stores/syncLocation';
import { SyncedContent, ChangeItem } from './syncTypes';

/**
 * Upgrade hashes if syncedContent is from an old version.
 */
export const upgradeSyncedContent = (syncedContent: SyncedContent): SyncedContent => {
  if (syncedContent.v) {
    return syncedContent;
  }
  const hashUpgrades: Record<string, number> = {};
  const historyData: Record<string, ChangeItem> = {};
  const syncHistory: Record<string, number[]> = {};
  Object.entries(syncedContent.historyData).forEach(([hash, content]) => {
    const newContent = utils.addItemHash(content);
    historyData[newContent.hash] = newContent;
    hashUpgrades[hash] = newContent.hash;
  });
  Object.entries(syncedContent.syncHistory).forEach(([id, hashEntries]) => {
    syncHistory[id] = hashEntries.map((hash: number) => hashUpgrades[String(hash)]);
  });
  return {
    ...syncedContent,
    historyData,
    syncHistory,
    v: 1,
  };
};

/**
 * Clean a syncedContent: drop syncHistory for removed syncLocations and
 * historyData for contents no longer referenced by any syncHistory entry.
 */
export const cleanSyncedContent = (syncedContent: SyncedContent): void => {
  // Clean syncHistory from removed syncLocations
  Object.keys(syncedContent.syncHistory).forEach((syncLocationId: string) => {
    if (syncLocationId !== 'main' && !useSyncLocationStore().itemsById[syncLocationId]) {
      delete syncedContent.syncHistory[syncLocationId];
    }
  });

  const allSyncLocationHashSet = new Set<number>(([] as number[])
    .concat(...Object.keys(syncedContent.syncHistory)
      .map((id: string) => syncedContent.syncHistory[id])));

  // Clean historyData from unused contents
  Object.keys(syncedContent.historyData)
    .map((hash: string) => parseInt(hash, 10))
    .forEach((hash: number) => {
      if (!allSyncLocationHashSet.has(hash)) {
        delete syncedContent.historyData[hash];
      }
    });
};
