import { defineStore } from 'pinia';
import utils from '../services/utils';
import constants from '../data/constants';
import { useNotificationStore } from './notification';
import { useFolderStore } from './folder';
import { useSyncedContentStore } from './syncedContent';
import { useContentStateStore } from './contentState';
import { useFileStore } from './file';
import { useContentStore } from './content';
import { usePublishLocationStore } from './publishLocation';
import { useSyncLocationStore } from './syncLocation';
import { useWorkspaceStore } from './workspace';
import { useDataStore } from './data';
import { useExplorerStore } from './explorer';

export const useGlobalStore = defineStore('global', {
  state: () => ({
    light: false,
    offline: false,
    lastOfflineCheck: 0,
    timeCounter: 0,
  }),
  getters: {
    allItemsById() {
      const result = {};
      const piniaStores = {
        folder: useFolderStore,
        syncedContent: useSyncedContentStore,
        contentState: useContentStateStore,
        file: useFileStore,
        content: useContentStore,
        publishLocation: usePublishLocationStore,
        syncLocation: useSyncLocationStore,
      };
      constants.types.forEach((type) => {
        if (piniaStores[type]) {
          Object.assign(result, piniaStores[type]().itemsById);
        }
      });
      return result;
    },
    pathsByItemId() {
      const result = {};
      const processNode = (node, parentPath = '') => {
        let path = parentPath;
        if (node.item.id) {
          path += node.item.name;
          if (node.isTrash) {
            path = '.stackedit-trash/';
          } else if (node.isFolder) {
            path += '/';
          }
          result[node.item.id] = path;
        }
        if (node.isFolder) {
          node.folders.forEach(child => processNode(child, path));
          node.files.forEach(child => processNode(child, path));
        }
      };
      processNode(useExplorerStore().rootNode);
      return result;
    },
    itemsByPath() {
      const allItemsById = this.allItemsById;
      const pathsByItemId = this.pathsByItemId;
      const result = {};
      Object.entries(pathsByItemId).forEach(([id, path]) => {
        const items = result[path] || [];
        items.push(allItemsById[id]);
        result[path] = items;
      });
      return result;
    },
    gitPathsByItemId() {
      const allItemsById = this.allItemsById;
      const pathsByItemId = this.pathsByItemId;
      const result = {};
      Object.entries(allItemsById).forEach(([id, item]) => {
        if (item.type === 'data') {
          result[id] = `.stackedit-data/${id}.json`;
        } else if (item.type === 'file') {
          const filePath = pathsByItemId[id];
          result[id] = `${filePath}.md`;
          result[`${id}/content`] = `/${filePath}.md`;
        } else if (item.type === 'content') {
          const [fileId] = id.split('/');
          const filePath = pathsByItemId[fileId];
          result[fileId] = `${filePath}.md`;
          result[id] = `/${filePath}.md`;
        } else if (item.type === 'folder') {
          result[id] = pathsByItemId[id];
        } else if (item.type === 'syncLocation' || item.type === 'publishLocation') {
          const encodedItem = utils.encodeBase64(utils.serializeObject({
            ...item,
            id: undefined,
            type: undefined,
            fileId: undefined,
            hash: undefined,
          }), true);
          const extension = item.type === 'syncLocation' ? 'sync' : 'publish';
          result[id] = `${pathsByItemId[item.fileId]}.${encodedItem}.${extension}`;
        }
      });
      return result;
    },
    itemIdsByGitPath() {
      const result = {};
      Object.entries(this.gitPathsByItemId).forEach(([id, path]) => {
        result[path] = id;
      });
      return result;
    },
    itemsByGitPath() {
      const allItemsById = this.allItemsById;
      const result = {};
      Object.entries(this.gitPathsByItemId).forEach(([id, path]) => {
        const item = allItemsById[id];
        if (item) result[path] = item;
      });
      return result;
    },
    isSponsor() {
      if (this.light) return true;
      if (!useDataStore().serverConf.allowSponsorship) return true;
      const sponsorToken = useWorkspaceStore().sponsorToken;
      return sponsorToken ? sponsorToken.isSponsor : false;
    },
  },
  actions: {
    setLight(value) { this.light = value; },
    setOfflineRaw(value) { this.offline = value; },
    updateLastOfflineCheck() { this.lastOfflineCheck = Date.now(); },
    updateTimeCounter() { this.timeCounter += 1; },
    setOffline(value) {
      if (this.offline !== value) {
        this.setOfflineRaw(value);
        if (this.offline) {
          return Promise.reject(new Error('You are offline.'));
        }
        useNotificationStore().info('You are back online!');
      }
      return Promise.resolve();
    },
  },
});
