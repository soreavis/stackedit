import { createItemStore } from './itemStoreFactory';
import providerRegistry from '../services/providers/common/providerRegistry';
import utils from '../services/utils';
import { useFileStore } from './file';
import { useDataStore } from './data';
import { useWorkspaceStore } from './workspace';

const addToGroup = (groups, item) => {
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
export function createLocationStore(storeId, empty) {
  return createItemStore(storeId, empty, false, {
    extraGetters: {
      groupedByFileId(state) {
        const groups = {};
        Object.values(state.itemsById).forEach(item => addToGroup(groups, item));
        return groups;
      },
      groupedByFileIdAndHash(state) {
        const fileIdGroups = {};
        Object.values(state.itemsById).forEach((item) => {
          let hashGroups = fileIdGroups[item.fileId];
          if (!hashGroups) {
            hashGroups = {};
            fileIdGroups[item.fileId] = hashGroups;
          }
          const list = hashGroups[item.hash];
          if (!list) {
            hashGroups[item.hash] = [item];
          } else {
            list.push(item);
          }
        });
        return fileIdGroups;
      },
      filteredGroupedByFileId(state) {
        const groups = {};
        Object.values(state.itemsById)
          .filter((item) => {
            const provider = providerRegistry.providersById[item.providerId];
            return provider && provider.getToken(item);
          })
          .forEach(item => addToGroup(groups, item));
        return groups;
      },
      current() {
        const locations = this.filteredGroupedByFileId[useFileStore().current.id] || [];
        return locations.map((location) => {
          const provider = providerRegistry.providersById[location.providerId];
          return {
            ...location,
            description: utils.sanitizeName(provider.getLocationDescription(location)),
            url: provider.getLocationUrl(location),
          };
        });
      },
      currentWithWorkspaceSyncLocation() {
        const fileId = useFileStore().current.id;
        const syncDataByItemId = useDataStore().syncDataByItemId;
        const fileSyncData = syncDataByItemId[fileId];
        const contentSyncData = syncDataByItemId[`${fileId}/content`];
        if (!fileSyncData || !contentSyncData) {
          return this.current;
        }
        const workspaceProvider = providerRegistry.providersById[
          useWorkspaceStore().currentWorkspace.providerId];
        return [{
          id: 'main',
          providerId: workspaceProvider.id,
          fileId,
          description: utils.sanitizeName(workspaceProvider
            .getSyncDataDescription(fileSyncData, contentSyncData)),
          url: workspaceProvider.getSyncDataUrl(fileSyncData, contentSyncData),
        }, ...this.current];
      },
    },
  });
}
