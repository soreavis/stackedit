// Bridge for callers that dispatch type-keyed item-store operations
// (workspaceSvc, localDbSvc, syncSvc, publishSvc) when the type is
// determined at runtime.

import { useFolderStore } from './folder';
import { useSyncedContentStore } from './syncedContent';
import { useContentStateStore } from './contentState';
import { useFileStore } from './file';
import { useContentStore } from './content';
import { usePublishLocationStore } from './publishLocation';
import { useSyncLocationStore } from './syncLocation';

const piniaStores = {
  folder: useFolderStore,
  syncedContent: useSyncedContentStore,
  contentState: useContentStateStore,
  file: useFileStore,
  content: useContentStore,
  publishLocation: usePublishLocationStore,
  syncLocation: useSyncLocationStore,
};

export function setItemByType(type, value) {
  piniaStores[type]().setItem(value);
}

export function patchItemByType(type, patch) {
  return piniaStores[type]().patchItem(patch);
}

export function deleteItemByType(type, id) {
  piniaStores[type]().deleteItem(id);
}

export function getItemsByType(type) {
  return piniaStores[type]().items;
}

export function getGroupedByFileIdAndHashByType(type) {
  return piniaStores[type]().groupedByFileIdAndHash;
}
