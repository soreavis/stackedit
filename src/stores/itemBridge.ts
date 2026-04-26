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

interface BridgedItem {
  id: string;
  type?: string;
  hash?: number;
  fileId?: string;
  [key: string]: unknown;
}

type BridgedStore = () => {
  items: BridgedItem[];
  groupedByFileIdAndHash?: Record<string, Record<string, BridgedItem[]>>;
  setItem: (value: BridgedItem) => void;
  patchItem: (patch: BridgedItem) => boolean;
  deleteItem: (id: string) => void;
};

const piniaStores: Record<string, BridgedStore> = {
  folder: useFolderStore as unknown as BridgedStore,
  syncedContent: useSyncedContentStore as unknown as BridgedStore,
  contentState: useContentStateStore as unknown as BridgedStore,
  file: useFileStore as unknown as BridgedStore,
  content: useContentStore as unknown as BridgedStore,
  publishLocation: usePublishLocationStore as unknown as BridgedStore,
  syncLocation: useSyncLocationStore as unknown as BridgedStore,
};

export function setItemByType(type: string, value: BridgedItem): void {
  piniaStores[type]().setItem(value);
}

export function patchItemByType(type: string, patch: BridgedItem): boolean {
  return piniaStores[type]().patchItem(patch);
}

export function deleteItemByType(type: string, id: string): void {
  piniaStores[type]().deleteItem(id);
}

export function getItemsByType(type: string): BridgedItem[] {
  return piniaStores[type]().items;
}

export function getGroupedByFileIdAndHashByType(
  type: string,
): Record<string, Record<string, BridgedItem[]>> {
  return piniaStores[type]().groupedByFileIdAndHash || {};
}
