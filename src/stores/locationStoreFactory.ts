import { createItemStore, BaseItem } from './itemStoreFactory';
import providerRegistry from '../services/providers/common/providerRegistry';
import utils from '../services/utils';
import { useFileStore } from './file';
import { useDataStore } from './data';
import { useWorkspaceStore } from './workspace';

export interface LocationItem extends BaseItem {
  // Empty factories default fileId/providerId to null at runtime; the
  // typed surface is "string | undefined" to match what real callers
  // see (sync/publishLocation always carry both once persisted) without
  // pretending the empty placeholder has them.
  fileId?: string;
  providerId?: string;
}

const addToGroup = <T extends LocationItem>(groups: Record<string, T[]>, item: T): void => {
  if (!item.fileId) return;
  const list = groups[item.fileId];
  if (!list) {
    groups[item.fileId] = [item];
  } else {
    list.push(item);
  }
};

// Pinia equivalent of src/store/locationTemplate.js. Wraps
// itemStoreFactory and layers the location-aware getters
// (groupedByFileId / groupedByFileIdAndHash / filteredGroupedByFileId /
// current / currentWithWorkspaceSyncLocation).
export function createLocationStore<T extends LocationItem>(
  storeId: string,
  empty: (id?: string) => T,
) {
  return createItemStore<T>(storeId, empty, false, {
    extraGetters: {
      groupedByFileId(state: { itemsById: Record<string, T> }): Record<string, T[]> {
        const groups: Record<string, T[]> = {};
        Object.values(state.itemsById).forEach(item => addToGroup(groups, item));
        return groups;
      },
      groupedByFileIdAndHash(state: { itemsById: Record<string, T> }): Record<string, Record<string, T[]>> {
        const fileIdGroups: Record<string, Record<string, T[]>> = {};
        Object.values(state.itemsById).forEach((item) => {
          if (!item.fileId) return;
          let hashGroups = fileIdGroups[item.fileId];
          if (!hashGroups) {
            hashGroups = {};
            fileIdGroups[item.fileId] = hashGroups;
          }
          const hashKey = String(item.hash ?? '');
          const list = hashGroups[hashKey];
          if (!list) {
            hashGroups[hashKey] = [item];
          } else {
            list.push(item);
          }
        });
        return fileIdGroups;
      },
      filteredGroupedByFileId(state: { itemsById: Record<string, T> }): Record<string, T[]> {
        const groups: Record<string, T[]> = {};
        Object.values(state.itemsById)
          .filter((item) => {
            const provider = (providerRegistry as any).providersById[item.providerId as string];
            return provider && provider.getToken(item);
          })
          .forEach(item => addToGroup(groups, item));
        return groups;
      },
      current(): unknown[] {
        const grouped = (this as any).filteredGroupedByFileId as Record<string, T[]>;
        const locations = grouped[useFileStore().current.id] || [];
        return locations.map((location) => {
          const provider = (providerRegistry as any).providersById[location.providerId as string];
          return {
            ...location,
            description: utils.sanitizeName(provider.getLocationDescription(location)),
            url: provider.getLocationUrl(location),
          };
        });
      },
      currentWithWorkspaceSyncLocation(): unknown[] {
        const fileId = useFileStore().current.id;
        const syncDataByItemId = (useDataStore() as any).syncDataByItemId as Record<string, unknown>;
        const fileSyncData = syncDataByItemId[fileId];
        const contentSyncData = syncDataByItemId[`${fileId}/content`];
        if (!fileSyncData || !contentSyncData) {
          return (this as any).current;
        }
        const workspaceProvider = (providerRegistry as any).providersById[
          (useWorkspaceStore() as any).currentWorkspace.providerId];
        return [{
          id: 'main',
          providerId: workspaceProvider.id,
          fileId,
          description: utils.sanitizeName(workspaceProvider
            .getSyncDataDescription(fileSyncData, contentSyncData)),
          url: workspaceProvider.getSyncDataUrl(fileSyncData, contentSyncData),
        }, ...(this as any).current];
      },
    },
  });
}
