// 960-line sync orchestrator: workspace sync, file sync, content
// merge, queue/retry, location resolution. Provider responses still
// use `any` (heterogeneous vendor APIs); core wire shapes (SyncData,
// Change, SyncedContent, SyncContext) are typed below.
import localDbSvc from './localDbSvc';
import { useSyncLocationStore } from '../stores/syncLocation';
import { usePublishLocationStore } from '../stores/publishLocation';
import { useWorkspaceStore } from '../stores/workspace';
import { useContentStore } from '../stores/content';
import { useFileStore } from '../stores/file';
import { setItemByType, patchItemByType, deleteItemByType } from '../stores/itemBridge';
import { useFolderStore } from '../stores/folder';
import { useSyncedContentStore } from '../stores/syncedContent';
import { useModalStore } from '../stores/modal';
import { useNotificationStore } from '../stores/notification';
import utils from './utils';
import diffUtils from './diffUtils';
import networkSvc from './networkSvc';
import providerRegistry from './providers/common/providerRegistry';
import googleDriveAppDataProvider from './providers/googleDriveAppDataProvider';
import './providers/couchdbWorkspaceProvider';
import './providers/githubWorkspaceProvider';
import './providers/gitlabWorkspaceProvider';
import './providers/googleDriveWorkspaceProvider';
import tempFileSvc from './tempFileSvc';
import workspaceSvc from './workspaceSvc';
import constants from '../data/constants';
import badgeSvc from './badgeSvc';
import { useQueueStore } from '../stores/queue';
import { useDataStore } from '../stores/data';
import { useGlobalStore } from '../stores/global';

const minAutoSyncEvery = 60 * 1000; // 60 sec
const inactivityThreshold = 3 * 1000; // 3 sec
const restartSyncAfter = 30 * 1000; // 30 sec
const restartContentSyncAfter = 1000; // Enough to detect an authorize pop up
const checkSponsorshipAfter = (5 * 60 * 1000) + (30 * 1000); // tokenExpirationMargin + 30 sec
const maxContentHistory = 20;

const LAST_SEEN = 0;
const LAST_MERGED = 1;
const LAST_SENT = 2;

// Core sync wire shapes — minimal surfaces touched by this module.
// Providers return arbitrary additional fields (which we read via `any`
// at the call site).
interface SyncData {
  id: string;
  itemId?: string;
  type?: string;
  hash?: number;
  parentIds?: string[];
}

interface ChangeItem {
  id: string;
  type?: string;
  hash?: number;
  [key: string]: unknown;
}

interface Change {
  fileId?: string;
  syncDataId: string;
  syncData?: SyncData;
  item?: ChangeItem;
  file?: { name?: string; [key: string]: unknown };
}

interface SyncedContent {
  id: string;
  v?: number;
  historyData: Record<string, ChangeItem>;
  syncHistory: Record<string, number[]>;
  [key: string]: unknown;
}

let actionProvider: any;
let workspaceProvider: any;

/**
 * Use a lock in the local storage to prevent multiple windows concurrency.
 */
let lastSyncActivity: number | undefined;
const getLastStoredSyncActivity = (): number =>
  parseInt(localStorage.getItem((useWorkspaceStore() as any).lastSyncActivityKey) || '', 10) || 0;

/**
 * Return true if workspace sync is possible.
 */
const isWorkspaceSyncPossible = (): boolean => !!(useWorkspaceStore() as any).syncToken;

/**
 * Return true if file has at least one explicit sync location.
 */
const hasCurrentFileSyncLocations = (): boolean => !!(useSyncLocationStore() as any).current.length;

/**
 * Return true if we are online and we have something to sync.
 */
const isSyncPossible = (): boolean => !(useGlobalStore() as any).offline &&
  (isWorkspaceSyncPossible() || hasCurrentFileSyncLocations());

/**
 * Return true if we are the many window, ie we have the lastSyncActivity lock.
 */
const isSyncWindow = (): boolean => {
  const storedLastSyncActivity = getLastStoredSyncActivity();
  return lastSyncActivity === storedLastSyncActivity ||
    Date.now() > inactivityThreshold + storedLastSyncActivity;
};

/**
 * Return true if auto sync can start, ie if lastSyncActivity is old enough.
 */
const isAutoSyncReady = (): boolean => {
  let { autoSyncEvery } = (useDataStore() as any).computedSettings;
  if (autoSyncEvery < minAutoSyncEvery) {
    autoSyncEvery = minAutoSyncEvery;
  }
  return Date.now() > autoSyncEvery + getLastStoredSyncActivity();
};

/**
 * Update the lastSyncActivity, assuming we have the lock.
 */
const setLastSyncActivity = (): void => {
  const currentDate = Date.now();
  lastSyncActivity = currentDate;
  localStorage.setItem((useWorkspaceStore() as any).lastSyncActivityKey, `${currentDate}`);
};

/**
 * Upgrade hashes if syncedContent is from an old version
 */
const upgradeSyncedContent = (syncedContent: SyncedContent): SyncedContent => {
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
 * Clean a syncedContent.
 */
const cleanSyncedContent = (syncedContent: SyncedContent): void => {
  // Clean syncHistory from removed syncLocations
  Object.keys(syncedContent.syncHistory).forEach((syncLocationId: string) => {
    if (syncLocationId !== 'main' && !(useSyncLocationStore() as any).itemsById[syncLocationId]) {
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

/**
 * Apply changes retrieved from the workspace provider. Update sync data accordingly.
 */
const applyChanges = (changes: Change[]): void => {
  const allItemsById: Record<string, ChangeItem> = { ...(useGlobalStore() as any).allItemsById };
  const syncDataById: Record<string, SyncData> = { ...(useDataStore() as any).syncDataById };
  const idsToKeep: Record<string, boolean> = {};
  let saveSyncData = false;
  let getExistingItem: (existingSyncData: SyncData | undefined) => ChangeItem | undefined;
  if ((useWorkspaceStore() as any).currentWorkspaceIsGit) {
    const itemsByGitPath: Record<string, ChangeItem> = { ...(useGlobalStore() as any).itemsByGitPath };
    getExistingItem = (existingSyncData) => existingSyncData && itemsByGitPath[existingSyncData.id];
  } else {
    getExistingItem = (existingSyncData) => existingSyncData && existingSyncData.itemId
      ? allItemsById[existingSyncData.itemId]
      : undefined;
  }

  // Process each change
  changes.forEach((change) => {
    const existingSyncData = syncDataById[change.syncDataId];
    const existingItem = getExistingItem(existingSyncData);
    // If item was removed
    if (!change.item && existingSyncData) {
      if (syncDataById[change.syncDataId]) {
        delete syncDataById[change.syncDataId];
        saveSyncData = true;
      }
      if (existingItem) {
        // Remove object from the store
        deleteItemByType(existingItem.type as string, existingItem.id);
        delete allItemsById[existingItem.id];
      }
    // If item was modified
    } else if (change.item && change.item.hash && change.syncData) {
      idsToKeep[change.item.id] = true;

      if ((existingSyncData || {}).hash !== change.syncData.hash) {
        syncDataById[change.syncDataId] = change.syncData;
        saveSyncData = true;
      }
      if (
        // If no sync data or existing one is different
        (existingSyncData || {}).hash !== change.item.hash
        // And no existing item or existing item is different
        && (existingItem || {}).hash !== change.item.hash
        // And item is not content nor data, which will be merged later
        && change.item.type !== 'content' && change.item.type !== 'data'
      ) {
        setItemByType(change.item.type as string, change.item);
        allItemsById[change.item.id] = change.item;
      }
    }
  });

  if (saveSyncData) {
    (useDataStore() as any).setSyncDataById(syncDataById);

    // Sanitize the workspace
    (workspaceSvc as any).sanitizeWorkspace(idsToKeep);
  }
};

/**
 * Create a sync location by uploading the current file content.
 */
const createSyncLocation = (syncLocation: any): void => {
  const currentFile: any = useFileStore().current;
  const fileId = currentFile.id;
  syncLocation.fileId = fileId;
  // Use deepCopy to freeze the item
  const content = utils.deepCopy(useContentStore().current);
  (useQueueStore() as any).enqueue(
    async () => {
      const provider = (providerRegistry as any).providersById[syncLocation.providerId];
      const token = provider.getToken(syncLocation);
      const updatedSyncLocation = await provider.uploadContent(token, {
        ...content,
        history: [content.hash],
      }, syncLocation);
      await (localDbSvc as any).loadSyncedContent(fileId);
      const newSyncedContent = utils.deepCopy(upgradeSyncedContent((useSyncedContentStore() as any).itemsById[`${fileId}/syncedContent`]));
      const newSyncHistoryItem: any[] = [];
      newSyncedContent.syncHistory[syncLocation.id] = newSyncHistoryItem;
      newSyncHistoryItem[LAST_SEEN] = content.hash;
      newSyncHistoryItem[LAST_SENT] = content.hash;
      newSyncedContent.historyData[content.hash] = content;

      (useSyncedContentStore() as any).patchItem(newSyncedContent);
      (workspaceSvc as any).addSyncLocation(updatedSyncLocation);
      (useNotificationStore() as any).info(`A new synchronized location was added to "${currentFile.name}".`);
    },
  );
};

/**
 * Prevent from sending new data too long after old data has been fetched.
 */
const tooLateChecker = (timeout: number): any => {
  const tooLateAfter = Date.now() + timeout;
  return (cb: () => any): any => {
    if (tooLateAfter < Date.now()) {
      throw new Error('TOO_LATE');
    }
    return cb();
  };
};

/**
 * Return true if file is in the temp folder or is a welcome file.
 */
const isTempFile = (fileId: string): boolean => {
  const contentId = `${fileId}/content`;
  if ((useDataStore() as any).syncDataByItemId[contentId]) {
    // If file has already been synced, let's not consider it a temp file
    return false;
  }
  const file: any = (useFileStore() as any).itemsById[fileId];
  const content: any = (useContentStore() as any).itemsById[contentId];
  if (!file || !content) {
    return false;
  }
  if (file.parentId === 'temp') {
    return true;
  }
  const locations = [
    ...(useSyncLocationStore() as any).filteredGroupedByFileId[fileId] || [],
    ...(usePublishLocationStore() as any).filteredGroupedByFileId[fileId] || [],
  ];
  if (locations.length) {
    // If file has sync/publish locations, it's not a temp file
    return false;
  }
  // Return true if it's a welcome file that has no discussion
  const { welcomeFileHashes } = (useDataStore() as any).localSettings;
  const hash = utils.hash(content.text);
  const hasDiscussions = Object.keys(content.discussions).length;
  return file.name === 'Welcome file' && welcomeFileHashes[hash] && !hasDiscussions;
};

/**
 * Patch sync data if some have changed in the result.
 */
const updateSyncData = (result: any): any => {
  [
    result.syncData,
    result.contentSyncData,
    result.fileSyncData,
  ].forEach((syncData: any) => {
    if (syncData) {
      const oldSyncData = (useDataStore() as any).syncDataById[syncData.id];
      if (utils.serializeObject(oldSyncData) !== utils.serializeObject(syncData)) {
        (useDataStore() as any).patchSyncDataById({
          [syncData.id]: syncData,
        });
      }
    }
  });
  return result;
};

class SyncContext {
  restartSkipContents = false;
  attempted: Record<string, boolean> = {};
}

/**
 * Sync one file with all its locations.
 */
const syncFile = async (fileId: string, syncContext: any = new SyncContext()): Promise<void> => {
  const contentId = `${fileId}/content`;
  syncContext.attempted[contentId] = true;

  await (localDbSvc as any).loadSyncedContent(fileId);
  try {
    await (localDbSvc as any).loadItem(contentId);
  } catch (e) {
    // Item may not exist if content has not been downloaded yet
  }

  const getSyncedContent = (): any => upgradeSyncedContent((useSyncedContentStore() as any).itemsById[`${fileId}/syncedContent`]);
  const getSyncHistoryItem = (syncLocationId: string): any => getSyncedContent().syncHistory[syncLocationId];

  try {
    if (isTempFile(fileId)) {
      return;
    }

    const syncLocations: any[] = [
      ...(useSyncLocationStore() as any).filteredGroupedByFileId[fileId] || [],
    ];
    if (isWorkspaceSyncPossible()) {
      syncLocations.unshift({ id: 'main', providerId: workspaceProvider.id, fileId });
    }

    await utils.awaitSequence(syncLocations, async (syncLocation: any) => {
      const provider: any = (providerRegistry as any).providersById[syncLocation.providerId];
      if (!provider) {
        return;
      }
      const token = provider.getToken(syncLocation);
      if (!token) {
        return;
      }

      const downloadContent = async (): Promise<any> => {
        // On simple provider, call simply downloadContent
        if (syncLocation.id !== 'main') {
          return provider.downloadContent(token, syncLocation);
        }

        // On workspace provider, call downloadWorkspaceContent
        const oldContentSyncData = (useDataStore() as any).syncDataByItemId[contentId];
        const oldFileSyncData = (useDataStore() as any).syncDataByItemId[fileId];
        if (!oldContentSyncData || !oldFileSyncData) {
          return null;
        }

        const { content } = updateSyncData(await provider.downloadWorkspaceContent({
          token,
          contentId,
          contentSyncData: oldContentSyncData,
          fileSyncData: oldFileSyncData,
        }));

        // Return the downloaded content
        return content;
      };

      const uploadContent = async (content: any, ifNotTooLate: any): Promise<any> => {
        // On simple provider, call simply uploadContent
        if (syncLocation.id !== 'main') {
          return provider.uploadContent(token, content, syncLocation, ifNotTooLate);
        }

        // On workspace provider, call uploadWorkspaceContent
        const oldContentSyncData = (useDataStore() as any).syncDataByItemId[contentId];
        if (oldContentSyncData && oldContentSyncData.hash === content.hash) {
          return syncLocation;
        }
        const oldFileSyncData = (useDataStore() as any).syncDataByItemId[fileId];

        updateSyncData(await provider.uploadWorkspaceContent({
          token,
          content,
          // Use deepCopy to freeze item
          file: utils.deepCopy((useFileStore() as any).itemsById[fileId]),
          contentSyncData: oldContentSyncData,
          fileSyncData: oldFileSyncData,
          ifNotTooLate,
        }));

        // Return syncLocation
        return syncLocation;
      };

      const doSyncLocation = async (): Promise<void> => {
        const serverContent = await downloadContent();
        const syncedContent = getSyncedContent();
        const syncHistoryItem = getSyncHistoryItem(syncLocation.id);

        // Merge content
        let mergedContent: any;
        const clientContent: any = utils.deepCopy((useContentStore() as any).itemsById[contentId]);
        if (!clientContent) {
          mergedContent = utils.deepCopy(serverContent || null);
        } else if (!serverContent // If sync location has not been created yet
          // Or server and client contents are synced
          || serverContent.hash === clientContent.hash
          // Or server content has not changed or has already been merged
          || syncedContent.historyData[serverContent.hash]
        ) {
          mergedContent = clientContent;
        } else {
          // Perform a merge with last merged content if any, or perform a simple fusion otherwise
          let lastMergedContent: any = utils.someResult(
            serverContent.history,
            (hash: any) => syncedContent.historyData[hash],
          );
          if (!lastMergedContent && syncHistoryItem) {
            lastMergedContent = syncedContent.historyData[syncHistoryItem[LAST_MERGED]];
          }
          mergedContent = diffUtils.mergeContent(serverContent, clientContent, lastMergedContent);
          // Surface a real 3-way conflict to the user. Auto-merge always
          // produces a result, but when both server AND client edits diverge
          // from the last-merged baseline, the user should know their edits
          // were recombined non-trivially. Prior behavior was silent.
          const serverChanged = lastMergedContent && lastMergedContent.text !== serverContent.text;
          const clientChanged = lastMergedContent && lastMergedContent.text !== clientContent.text;
          if (serverChanged && clientChanged && serverContent.text !== clientContent.text) {
            const fileName = ((useFileStore() as any).itemsById[fileId] || {}).name || 'a file';
            (useNotificationStore() as any).info(`Sync auto-merged concurrent edits in "${fileName}". Use File → History to compare versions.`);
          }
        }
        if (!mergedContent) {
          return;
        }

        // Update or set content in store
        (useContentStore() as any).setItem({
          id: contentId,
          text: utils.sanitizeText(mergedContent.text),
          properties: utils.sanitizeText(mergedContent.properties),
          discussions: mergedContent.discussions,
          comments: mergedContent.comments,
        });

        // Retrieve content with its new hash value and freeze it
        mergedContent = utils.deepCopy((useContentStore() as any).itemsById[contentId]);

        // Make merged content history
        const mergedContentHistory: any[] = serverContent ? serverContent.history.slice() : [];
        let skipUpload = true;
        if (mergedContentHistory[0] !== mergedContent.hash) {
          // Put merged content hash at the beginning of history
          mergedContentHistory.unshift(mergedContent.hash);
          // Server content is either out of sync or its history is incomplete, do upload
          skipUpload = false;
        }
        if (syncHistoryItem
          && syncHistoryItem[LAST_SENT] != null
          && syncHistoryItem[LAST_SENT] !== mergedContent.hash
        ) {
          // Clean up by removing the hash we've previously added
          const idx = mergedContentHistory.lastIndexOf(syncHistoryItem[LAST_SENT]);
          if (idx !== -1) {
            mergedContentHistory.splice(idx, 1);
          }
        }

        // Update synced content
        const newSyncedContent: any = utils.deepCopy(syncedContent);
        const newSyncHistoryItem: any[] = newSyncedContent.syncHistory[syncLocation.id] || [];
        newSyncedContent.syncHistory[syncLocation.id] = newSyncHistoryItem;
        if (serverContent &&
          (serverContent.hash === newSyncHistoryItem[LAST_SEEN] ||
          serverContent.history.includes(newSyncHistoryItem[LAST_SEEN]))
        ) {
          // That's the 2nd time we've seen this content, trust it for future merges
          newSyncHistoryItem[LAST_MERGED] = newSyncHistoryItem[LAST_SEEN];
        }
        newSyncHistoryItem[LAST_MERGED] = newSyncHistoryItem[LAST_MERGED] || null;
        newSyncHistoryItem[LAST_SEEN] = mergedContent.hash;
        newSyncHistoryItem[LAST_SENT] = skipUpload ? null : mergedContent.hash;
        newSyncedContent.historyData[mergedContent.hash] = mergedContent;

        // Clean synced content from unused revisions
        cleanSyncedContent(newSyncedContent);
        // Store synced content
        (useSyncedContentStore() as any).patchItem(newSyncedContent);

        if (skipUpload) {
          // Server content and merged content are equal, skip content upload
          return;
        }

        // If content is to be created, schedule a restart to create the file as well
        if (provider === workspaceProvider &&
          !(useDataStore() as any).syncDataByItemId[fileId]
        ) {
          syncContext.restartSkipContents = true;
        }

        // Upload merged content
        const item = {
          ...mergedContent,
          history: mergedContentHistory.slice(0, maxContentHistory),
        };
        const syncLocationToStore = await uploadContent(
          item,
          tooLateChecker(restartContentSyncAfter),
        );

        // Replace sync location if modified
        if (utils.serializeObject(syncLocation) !==
          utils.serializeObject(syncLocationToStore)
        ) {
          (useSyncLocationStore() as any).patchItem(syncLocationToStore);
          (workspaceSvc as any).ensureUniqueLocations();
        }
      };

      await (useQueueStore() as any).doWithLocation({
        location: syncLocation,
        action: async () => {
          try {
            await doSyncLocation();
          } catch (err: any) {
            if ((useGlobalStore() as any).offline || (err && err.message === 'TOO_LATE')) {
              throw err;
            }
            console.error(err);
            (useNotificationStore() as any).error(err);
          }
        },
      });
    });
  } catch (err: any) {
    if (err && err.message === 'TOO_LATE') {
      // Restart sync
      await syncFile(fileId, syncContext);
    } else {
      throw err;
    }
  } finally {
    await (localDbSvc as any).unloadContents();
  }
};

/**
 * Sync a data item, typically settings, templates or workspaces.
 */
const syncDataItem = async (dataId: string): Promise<void> => {
  const getItem = (): any => (useDataStore() as any).itemsById[dataId]
    || (useDataStore() as any).lsItemsById[dataId];

  const oldItem: any = getItem();
  const oldSyncData = (useDataStore() as any).syncDataByItemId[dataId];
  // Sync if item hash and syncData hash are out of sync
  if (oldSyncData && oldItem && oldItem.hash === oldSyncData.hash) {
    return;
  }

  const token = workspaceProvider.getToken();
  const { item } = updateSyncData(await workspaceProvider.downloadWorkspaceData({
    token,
    syncData: oldSyncData,
  }));

  const serverItem = item;
  const dataSyncData = (useDataStore() as any).dataSyncDataById[dataId];
  const clientItem: any = utils.deepCopy(getItem());
  let mergedItem: any = (() => {
    if (!clientItem) {
      return serverItem;
    }
    if (!serverItem) {
      return clientItem;
    }
    if (!dataSyncData) {
      return serverItem;
    }
    if (dataSyncData.hash !== serverItem.hash) {
      // Server version has changed
      if (dataSyncData.hash !== clientItem.hash && typeof clientItem.data === 'object') {
        // Client version has changed as well, merge data objects
        return {
          ...clientItem,
          data: diffUtils.mergeObjects(serverItem.data, clientItem.data),
        };
      }
      return serverItem;
    }
    return clientItem;
  })();

  if (!mergedItem) {
    return;
  }

  if (clientItem && dataId === 'workspaces') {
    // Clean deleted workspaces
    await Promise.all(Object.keys(clientItem.data)
      .filter((id: string) => !mergedItem.data[id])
      .map((id: string) => (workspaceSvc as any).removeWorkspace(id)));
  }

  // Update item in store
  (useDataStore() as any).setItem({
    id: dataId,
    ...mergedItem,
  });

  // Retrieve item with new `hash` and freeze it
  mergedItem = utils.deepCopy(getItem());

  // Upload merged data item if out of sync
  if (!serverItem || serverItem.hash !== mergedItem.hash) {
    updateSyncData(await workspaceProvider.uploadWorkspaceData({
      token,
      item: mergedItem,
      syncData: (useDataStore() as any).syncDataByItemId[dataId],
      ifNotTooLate: tooLateChecker(restartContentSyncAfter),
    }));
  }

  // Copy sync data into data sync data
  (useDataStore() as any).patchDataSyncDataById({
    [dataId]: utils.deepCopy((useDataStore() as any).syncDataByItemId[dataId]),
  });
};

/**
 * Sync the whole workspace with the main provider and the current file explicit locations.
 */
const syncWorkspace = async (skipContents: boolean = false): Promise<void> => {
  try {
    const workspace: any = (useWorkspaceStore() as any).currentWorkspace;
    const syncContext = new SyncContext();

    // Store the sub in the DB since it's not safely stored in the token
    const syncToken: any = (useWorkspaceStore() as any).syncToken;
    const localSettings: any = (useDataStore() as any).localSettings;
    if (!localSettings.syncSub) {
      (useDataStore() as any).patchLocalSettings({
        syncSub: syncToken.sub,
      });
    } else if (localSettings.syncSub !== syncToken.sub) {
      throw new Error('Synchronization failed due to token inconsistency.');
    }

    const changes = await workspaceProvider.getChanges();

    // Apply changes
    applyChanges(workspaceProvider.prepareChanges(changes));
    workspaceProvider.onChangesApplied();

    // Prevent from sending items too long after changes have been retrieved
    const ifNotTooLate = tooLateChecker(restartSyncAfter);

    // Find and save one item to save
    await utils.awaitSome(() => ifNotTooLate(async () => {
      const storeItemMap: any = {
        ...(useFileStore() as any).itemsById,
        ...(useFolderStore() as any).itemsById,
        ...(useSyncLocationStore() as any).itemsById,
        ...(usePublishLocationStore() as any).itemsById,
        // Deal with contents and data later
      };

      const syncDataByItemId = (useDataStore() as any).syncDataByItemId;
      const isGit = !!(useWorkspaceStore() as any).currentWorkspaceIsGit;
      const [changedItem, syncDataToUpdate] = utils.someResult(
        Object.entries(storeItemMap),
        ([id, item]: [string, any]) => {
          const syncData = syncDataByItemId[id];
          if ((syncData && syncData.hash === item.hash)
            // Add file/folder only if parent folder has been added
            || (!isGit && storeItemMap[item.parentId] && !syncDataByItemId[item.parentId])
            // Don't create folder if it's a git workspace
            || (isGit && item.type === 'folder')
            // Add file only if content has been added
            || (item.type === 'file' && !syncDataByItemId[`${id}/content`])
          ) {
            return null;
          }
          return [item, syncData];
        },
      ) || [];

      if (!changedItem) return false;

      updateSyncData(await workspaceProvider.saveWorkspaceItem({
        // Use deepCopy to freeze objects
        item: utils.deepCopy(changedItem),
        syncData: utils.deepCopy(syncDataToUpdate),
        ifNotTooLate,
      }));

      return true;
    }));

    // Find and remove one item to remove
    await utils.awaitSome(() => ifNotTooLate(async () => {
      let getItem: (syncData: any) => any;
      let getFileItem: (syncData: any) => any;
      if ((useWorkspaceStore() as any).currentWorkspaceIsGit) {
        const { itemsByGitPath } = (useGlobalStore() as any);
        getItem = (syncData: any) => itemsByGitPath[syncData.id];
        getFileItem = (syncData: any) => itemsByGitPath[syncData.id.slice(1)];
      } else {
        const { allItemsById } = (useGlobalStore() as any);
        getItem = (syncData: any) => allItemsById[syncData.itemId];
        getFileItem = (syncData: any) => allItemsById[syncData.itemId.split('/')[0]];
      }

      const syncDataById = (useDataStore() as any).syncDataById;
      const syncDataToRemove = utils.deepCopy(utils.someResult(
        Object.values(syncDataById),
        (syncData: any) => {
          if (getItem(syncData)
            // We don't want to delete data items, especially on first sync
            || syncData.type === 'data'
            // Remove content only if file has been removed
            || (syncData.type === 'content' && getFileItem(syncData))
          ) {
            return null;
          }
          return syncData;
        },
      ));

      if (!syncDataToRemove) return false;

      await workspaceProvider.removeWorkspaceItem({
        syncData: syncDataToRemove,
        ifNotTooLate,
      });
      const syncDataByIdCopy: any = { ...(useDataStore() as any).syncDataById };
      delete syncDataByIdCopy[syncDataToRemove.id];
      (useDataStore() as any).setSyncDataById(syncDataByIdCopy);
      return true;
    }));

    // Sync settings, workspaces and badges only in the main workspace
    if (workspace.id === 'main') {
      await syncDataItem('settings');
      await syncDataItem('workspaces');
      await syncDataItem('badgeCreations');
    }
    await syncDataItem('templates');

    if (!skipContents) {
      const currentFileId = (useFileStore() as any).current.id;
      if (currentFileId) {
        // Sync current file first
        await syncFile(currentFileId, syncContext);
      }

      // Find and sync one file out of sync
      await utils.awaitSome(async () => {
        let getSyncData: (contentId: string) => any;
        if ((useWorkspaceStore() as any).currentWorkspaceIsGit) {
          const { gitPathsByItemId } = (useGlobalStore() as any);
          const syncDataById = (useDataStore() as any).syncDataById;
          getSyncData = (contentId: string) => syncDataById[gitPathsByItemId[contentId]];
        } else {
          const syncDataByItemId = (useDataStore() as any).syncDataByItemId;
          getSyncData = (contentId: string) => syncDataByItemId[contentId];
        }

        // Collect all [fileId, contentId]
        const ids: any[] = [
          ...Object.keys((localDbSvc as any).hashMap.content)
            .map((contentId: string) => [contentId.split('/')[0], contentId]),
          ...(useFileStore() as any).items
            .map((file: any) => [file.id, `${file.id}/content`]),
        ];

        // Find the first content out of sync
        const contentMap = (useContentStore() as any).itemsById;
        const fileIdToSync = utils.someResult(ids, ([fileId, contentId]: [string, string]) => {
          // Get the content hash from itemsById or from localDbSvc if not loaded
          const loadedContent = contentMap[contentId];
          const hash = loadedContent ? loadedContent.hash : (localDbSvc as any).hashMap.content[contentId];
          const syncData = getSyncData(contentId);
          if (
            // Sync if content syncing was not attempted yet
            !syncContext.attempted[contentId] &&
            // And if syncData does not exist or if content hash and syncData hash are inconsistent
            (!syncData || syncData.hash !== hash)
          ) {
            return fileId;
          }
          return null;
        });

        if (!fileIdToSync) return false;

        await syncFile(fileIdToSync, syncContext);
        return true;
      });
    }

    // Restart sync if requested
    if (syncContext.restartSkipContents) {
      await syncWorkspace(true);
    }

    if (workspace.id === 'main') {
      (badgeSvc as any).addBadge('syncMainWorkspace');
    }
  } catch (err: any) {
    if (err && err.message === 'TOO_LATE') {
      // Restart sync
      await syncWorkspace();
    } else {
      throw err;
    }
  }
};

/**
 * Enqueue a sync task, if possible.
 */
const requestSync = (addTriggerSyncBadge: boolean = false): void => {
  // No sync in light mode
  if ((useGlobalStore() as any).light) {
    return;
  }

  (useQueueStore() as any).enqueueSyncRequest(async () => {
    let intervalId: any;
    const attempt = async (): Promise<void> => {
      // Only start syncing when these conditions are met
      if ((networkSvc as any).isUserActive() && isSyncWindow()) {
        clearInterval(intervalId);
        if (!isSyncPossible()) {
          // Cancel sync
          throw new Error('Sync not possible.');
        }

        // Determine if we have to clean files
        const fileHashesToClean: any = {};
        if (getLastStoredSyncActivity() + (constants as any).cleanTrashAfter < Date.now()) {
          // Last synchronization happened 7 days ago
          const syncDataByItemId = (useDataStore() as any).syncDataByItemId;
          (useFileStore() as any).items.forEach((file: any) => {
            // If file is in the trash and has not been modified since it was last synced
            const syncData = syncDataByItemId[file.id];
            if (syncData && file.parentId === 'trash' && file.hash === syncData.hash) {
              fileHashesToClean[file.id] = file.hash;
            }
          });
        }

        // Call setLastSyncActivity periodically
        intervalId = utils.setInterval(() => setLastSyncActivity(), 1000);
        setLastSyncActivity();

        try {
          if (isWorkspaceSyncPossible()) {
            await syncWorkspace();
          } else if (hasCurrentFileSyncLocations()) {
            // Only sync the current file if workspace sync is unavailable
            // as we don't want to look for out-of-sync files by loading
            // all the syncedContent objects.
            await syncFile((useFileStore() as any).current.id);
          }

          // Clean files
          Object.entries(fileHashesToClean).forEach(([fileId, fileHash]: [string, any]) => {
            const file: any = (useFileStore() as any).itemsById[fileId];
            if (file && file.hash === fileHash) {
              (workspaceSvc as any).deleteFile(fileId);
            }
          });

          if (addTriggerSyncBadge) {
            (badgeSvc as any).addBadge('triggerSync');
          }
        } finally {
          clearInterval(intervalId);
        }
      }
    };

    intervalId = utils.setInterval(() => attempt(), 1000);
    return attempt();
  });
};

export default {
  async init(): Promise<void> {
    // Load workspaces and tokens from localStorage
    (localDbSvc as any).syncLocalStorage();

    // Try to find a suitable action provider
    actionProvider = (providerRegistry as any).providersById[utils.queryParams.providerId];
    if (actionProvider && actionProvider.initAction) {
      await actionProvider.initAction();
    }

    // Try to find a suitable workspace sync provider
    workspaceProvider = (providerRegistry as any).providersById[utils.queryParams.providerId];
    if (!workspaceProvider || !workspaceProvider.initWorkspace) {
      workspaceProvider = googleDriveAppDataProvider;
    }
    const workspace = await workspaceProvider.initWorkspace();
    // Fix the URL hash
    const { paymentSuccess } = utils.queryParams;
    utils.setQueryParams(workspaceProvider.getWorkspaceParams(workspace));

    (useWorkspaceStore() as any).setCurrentWorkspaceId(workspace.id);
    await (localDbSvc as any).init();

    // Enable sponsorship
    if (paymentSuccess) {
      (useModalStore() as any).open('paymentSuccess')
        .catch(() => { /* Cancel */ });
      const sponsorToken: any = (useWorkspaceStore() as any).sponsorToken;
      // Force check sponsorship after a few seconds
      const currentDate = Date.now();
      if (sponsorToken && sponsorToken.expiresOn > currentDate - checkSponsorshipAfter) {
        (useDataStore() as any).addGoogleToken({
          ...sponsorToken,
          expiresOn: currentDate - checkSponsorshipAfter,
        });
      }
    }

    // Try to find a suitable action provider
    actionProvider = (providerRegistry as any).providersById[utils.queryParams.providerId] || actionProvider;
    if (actionProvider && actionProvider.performAction) {
      const newSyncLocation = await actionProvider.performAction();
      if (newSyncLocation) {
        (this as any).createSyncLocation(newSyncLocation);
      }
    }

    await (tempFileSvc as any).init();

    if (!(useGlobalStore() as any).light) {
      // Sync periodically
      utils.setInterval(() => {
        if (isSyncPossible()
          && (networkSvc as any).isUserActive()
          && isSyncWindow()
          && isAutoSyncReady()
        ) {
          requestSync();
        }
      }, 1000);

      // Unload contents from memory periodically
      utils.setInterval(() => {
        // Wait for sync and publish to finish
        if ((useQueueStore() as any).isEmpty) {
          (localDbSvc as any).unloadContents();
        }
      }, 5000);
    }
  },
  isSyncPossible,
  requestSync,
  createSyncLocation,
};
