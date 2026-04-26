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

interface GlobalState {
  light: boolean;
  offline: boolean;
  lastOfflineCheck: number;
  timeCounter: number;
}

interface StackEditItem {
  id: string;
  type: string;
  name?: string;
  fileId?: string;
  [k: string]: unknown;
}

interface ExplorerNode {
  item: { id?: string; name?: string };
  isTrash?: boolean;
  isFolder?: boolean;
  folders?: ExplorerNode[];
  files?: ExplorerNode[];
}

export const useGlobalStore = defineStore('global', {
  state: (): GlobalState => ({
    light: false,
    offline: false,
    lastOfflineCheck: 0,
    timeCounter: 0,
  }),
  getters: {
    allItemsById(): Record<string, StackEditItem> {
      const result: Record<string, StackEditItem> = {};
      const piniaStores: Record<string, () => { itemsById?: Record<string, StackEditItem> }> = {
        folder: useFolderStore as unknown as () => { itemsById?: Record<string, StackEditItem> },
        syncedContent: useSyncedContentStore as unknown as () => { itemsById?: Record<string, StackEditItem> },
        contentState: useContentStateStore as unknown as () => { itemsById?: Record<string, StackEditItem> },
        file: useFileStore as unknown as () => { itemsById?: Record<string, StackEditItem> },
        content: useContentStore as unknown as () => { itemsById?: Record<string, StackEditItem> },
        publishLocation: usePublishLocationStore as unknown as () => { itemsById?: Record<string, StackEditItem> },
        syncLocation: useSyncLocationStore as unknown as () => { itemsById?: Record<string, StackEditItem> },
      };
      (constants as { types: string[] }).types.forEach((type) => {
        const factory = piniaStores[type];
        if (factory) {
          Object.assign(result, factory().itemsById || {});
        }
      });
      return result;
    },
    pathsByItemId(): Record<string, string> {
      const result: Record<string, string> = {};
      const processNode = (node: ExplorerNode, parentPath = '') => {
        let path = parentPath;
        if (node.item.id) {
          path += node.item.name || '';
          if (node.isTrash) {
            path = '.stackedit-trash/';
          } else if (node.isFolder) {
            path += '/';
          }
          result[node.item.id] = path;
        }
        if (node.isFolder) {
          (node.folders || []).forEach(child => processNode(child, path));
          (node.files || []).forEach(child => processNode(child, path));
        }
      };
      processNode((useExplorerStore() as unknown as { rootNode: ExplorerNode }).rootNode);
      return result;
    },
    itemsByPath(): Record<string, StackEditItem[]> {
      const allItemsById = this.allItemsById;
      const pathsByItemId = this.pathsByItemId;
      const result: Record<string, StackEditItem[]> = {};
      Object.entries(pathsByItemId).forEach(([id, path]) => {
        const items = result[path] || [];
        items.push(allItemsById[id]);
        result[path] = items;
      });
      return result;
    },
    gitPathsByItemId(): Record<string, string> {
      const allItemsById = this.allItemsById;
      const pathsByItemId = this.pathsByItemId;
      const result: Record<string, string> = {};
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
          const encodedItem = (utils as { encodeBase64: (s: string, urlSafe?: boolean) => string; serializeObject: (o: unknown) => string }).encodeBase64(
            (utils as { serializeObject: (o: unknown) => string }).serializeObject({
              ...item,
              id: undefined,
              type: undefined,
              fileId: undefined,
              hash: undefined,
            }),
            true,
          );
          const extension = item.type === 'syncLocation' ? 'sync' : 'publish';
          result[id] = `${pathsByItemId[item.fileId as string]}.${encodedItem}.${extension}`;
        }
      });
      return result;
    },
    itemIdsByGitPath(): Record<string, string> {
      const result: Record<string, string> = {};
      Object.entries(this.gitPathsByItemId).forEach(([id, path]) => {
        result[path] = id;
      });
      return result;
    },
    itemsByGitPath(): Record<string, StackEditItem> {
      const allItemsById = this.allItemsById;
      const result: Record<string, StackEditItem> = {};
      Object.entries(this.gitPathsByItemId).forEach(([id, path]) => {
        const item = allItemsById[id];
        if (item) result[path] = item;
      });
      return result;
    },
    isSponsor(): boolean {
      if (this.light) return true;
      if (!(useDataStore() as unknown as { serverConf: { allowSponsorship?: boolean } }).serverConf.allowSponsorship) return true;
      const sponsorToken = (useWorkspaceStore() as unknown as { sponsorToken?: { isSponsor?: boolean } }).sponsorToken;
      return sponsorToken ? !!sponsorToken.isSponsor : false;
    },
  },
  actions: {
    setLight(value: boolean) { this.light = value; },
    setOfflineRaw(value: boolean) { this.offline = value; },
    updateLastOfflineCheck() { this.lastOfflineCheck = Date.now(); },
    updateTimeCounter() { this.timeCounter += 1; },
    setOffline(value: boolean): Promise<void> {
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
