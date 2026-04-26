import store from '../store';
import { useSyncLocationStore } from '../stores/syncLocation';
import { usePublishLocationStore } from '../stores/publishLocation';
import { useWorkspaceStore } from '../stores/workspace';
import { useContentStore } from '../stores/content';
import { useFileStore } from '../stores/file';
import { setItemByType, patchItemByType, deleteItemByType } from '../stores/itemBridge';
import { useFolderStore } from '../stores/folder';
import { useSyncedContentStore } from '../stores/syncedContent';
import { useContentStateStore } from '../stores/contentState';
import { useModalStore } from '../stores/modal';
import utils from './utils';
import constants from '../data/constants';
import badgeSvc from './badgeSvc';
import { useDataStore } from '../stores/data';

interface Item {
  id: string;
  type?: string;
  name?: string;
  parentId?: string | null;
  hash?: number;
  fileId?: string;
  [key: string]: unknown;
}

interface CreateFileInput {
  name?: string;
  parentId?: string | null;
  text?: string;
  properties?: string;
  discussions?: Record<string, unknown>;
  comments?: Record<string, unknown>;
}

interface Location {
  id?: string;
  fileId?: string;
  hash?: number;
  [key: string]: unknown;
}

const forbiddenFolderNameMatcher = /^\.stackedit-data$|^\.stackedit-trash$|\.md$|\.sync$|\.publish$/;

export default {

  /**
   * Create a file in the store with the specified fields.
   */
  async createFile(
    {
      name,
      parentId,
      text,
      properties,
      discussions,
      comments,
    }: CreateFileInput = {},
    background = false,
  ): Promise<Item> {
    const id = utils.uid();
    const item: Item = {
      id,
      name: utils.sanitizeFilename(name),
      parentId: parentId || null,
    };
    const content = {
      id: `${id}/content`,
      text: utils.sanitizeText(text || useDataStore().computedSettings.newFileContent),
      properties: utils
        .sanitizeText(properties || useDataStore().computedSettings.newFileProperties),
      discussions: discussions || {},
      comments: comments || {},
    };
    const workspaceUniquePaths = useWorkspaceStore().currentWorkspaceHasUniquePaths;

    // Show warning dialogs
    if (!background) {
      // If name is being stripped
      if (item.name !== constants.defaultName && item.name !== name) {
        await useModalStore().open({
          type: 'stripName',
          item,
        });
      }

      // Check if there is already a file with that path
      if (workspaceUniquePaths) {
        const parentPath = store.getters.pathsByItemId[item.parentId as string] || '';
        const path = parentPath + item.name;
        if (store.getters.itemsByPath[path]) {
          await useModalStore().open({
            type: 'pathConflict',
            item,
          });
        }
      }
    }

    // Save file and content in the store
    useContentStore().setItem(content);
    useFileStore().setItem(item);
    if (workspaceUniquePaths) {
      this.makePathUnique(id);
    }

    // Return the new file item
    return (useFileStore().itemsById as Record<string, any>)[id];
  },

  /**
   * Make sanity checks and then create/update the folder/file in the store.
   */
  async storeItem(item: Item): Promise<Item | null> {
    const id = item.id || utils.uid();
    const sanitizedName = utils.sanitizeFilename(item.name);

    if (item.type === 'folder' && forbiddenFolderNameMatcher.exec(sanitizedName)) {
      await useModalStore().open({
        type: 'unauthorizedName',
        item,
      });
      throw new Error('Unauthorized name.');
    }

    // Show warning dialogs
    // If name has been stripped
    if (sanitizedName !== constants.defaultName && sanitizedName !== item.name) {
      await useModalStore().open({
        type: 'stripName',
        item,
      });
    }

    // Check if there is a path conflict
    if (useWorkspaceStore().currentWorkspaceHasUniquePaths) {
      const parentPath = store.getters.pathsByItemId[item.parentId as string] || '';
      const path = parentPath + sanitizedName;
      const items: Item[] = store.getters.itemsByPath[path] || [];
      if (items.some(itemWithSamePath => itemWithSamePath.id !== id)) {
        await useModalStore().open({
          type: 'pathConflict',
          item,
        });
      }
    }

    return this.setOrPatchItem({
      ...item,
      id,
    });
  },

  /**
   * Create/update the folder/file in the store and make sure its path is unique.
   */
  setOrPatchItem(patch: Item): Item | null {
    const item: Item = {
      ...store.getters.allItemsById[patch.id] || patch,
    };
    if (!item.id) {
      return null;
    }

    if (patch.parentId !== undefined) {
      item.parentId = patch.parentId || null;
    }
    if (patch.name) {
      const sanitizedName = utils.sanitizeFilename(patch.name);
      if (item.type !== 'folder' || !forbiddenFolderNameMatcher.exec(sanitizedName)) {
        item.name = sanitizedName;
      }
    }

    // Save item in the store
    setItemByType(item.type, item);

    // Remove circular reference
    this.removeCircularReference(item);

    // Ensure path uniqueness
    if (useWorkspaceStore().currentWorkspaceHasUniquePaths) {
      this.makePathUnique(item.id);
    }

    return store.getters.allItemsById[item.id];
  },

  /**
   * Delete a file in the store and all its related items.
   */
  deleteFile(fileId: string | null | undefined): void {
    if (!fileId) return;
    // Delete the file
    useFileStore().deleteItem(fileId);
    // Delete the content
    useContentStore().deleteItem(`${fileId}/content`);
    // Delete the syncedContent
    useSyncedContentStore().deleteItem(`${fileId}/syncedContent`);
    // Delete the contentState
    useContentStateStore().deleteItem(`${fileId}/contentState`);
    // Delete sync locations
    (((useSyncLocationStore() as any).groupedByFileId[fileId] || []) as Item[])
      .forEach(item => useSyncLocationStore().deleteItem(item.id));
    // Delete publish locations
    (((usePublishLocationStore() as any).groupedByFileId[fileId] || []) as Item[])
      .forEach(item => usePublishLocationStore().deleteItem(item.id));
  },

  /**
   * Sanitize the whole workspace.
   */
  sanitizeWorkspace(idsToKeep?: Record<string, boolean>): void {
    // Detect and remove circular references for all folders.
    (useFolderStore().items as Item[]).forEach(folder => this.removeCircularReference(folder));

    this.ensureUniquePaths(idsToKeep);
    this.ensureUniqueLocations(idsToKeep);
  },

  /**
   * Detect and remove circular reference for an item.
   */
  removeCircularReference(item: Item): void {
    const foldersById: Record<string, Item> = useFolderStore().itemsById;
    for (
      let parentFolder = foldersById[item.parentId as string];
      parentFolder;
      parentFolder = foldersById[parentFolder.parentId as string]
    ) {
      if (parentFolder.id === item.id) {
        useFolderStore().patchItem({
          id: item.id,
          parentId: null,
        });
        break;
      }
    }
  },

  /**
   * Ensure two files/folders don't have the same path if the workspace doesn't allow it.
   */
  ensureUniquePaths(idsToKeep: Record<string, boolean> = {}): void {
    if (useWorkspaceStore().currentWorkspaceHasUniquePaths) {
      if (Object.keys(store.getters.pathsByItemId)
        .some(id => !idsToKeep[id] && this.makePathUnique(id))
      ) {
        // Just changed one item path, restart
        this.ensureUniquePaths(idsToKeep);
      }
    }
  },

  /**
   * Return false if the file/folder path is unique.
   * Add a prefix to its name and return true otherwise.
   */
  makePathUnique(id: string): boolean {
    const { itemsByPath, allItemsById, pathsByItemId } = store.getters;
    const item: Item = allItemsById[id];
    if (!item) {
      return false;
    }
    let path: string = pathsByItemId[id];
    if ((itemsByPath[path] as Item[]).length === 1) {
      return false;
    }
    const isFolder = item.type === 'folder';
    if (isFolder) {
      // Remove trailing slash
      path = path.slice(0, -1);
    }
    for (let suffix = 1; ; suffix += 1) {
      let pathWithSuffix = `${path}.${suffix}`;
      if (isFolder) {
        pathWithSuffix += '/';
      }
      if (!itemsByPath[pathWithSuffix]) {
        patchItemByType(item.type, {
          id: item.id,
          name: `${item.name}.${suffix}`,
        });
        return true;
      }
    }
  },

  addSyncLocation(location: Location): void {
    useSyncLocationStore().setItem({
      ...location,
      id: utils.uid(),
    });

    // Sanitize the workspace
    this.ensureUniqueLocations();

    if (Object.keys((useSyncLocationStore() as any).currentWithWorkspaceSyncLocation).length > 1) {
      badgeSvc.addBadge('syncMultipleLocations');
    }
  },

  addPublishLocation(location: Location): void {
    usePublishLocationStore().setItem({
      ...location,
      id: utils.uid(),
    });

    // Sanitize the workspace
    this.ensureUniqueLocations();

    if (Object.keys((usePublishLocationStore() as any).current).length > 1) {
      badgeSvc.addBadge('publishMultipleLocations');
    }
  },

  /**
   * Ensure two sync/publish locations of the same file don't have the same hash.
   */
  ensureUniqueLocations(idsToKeep: Record<string, boolean> = {}): void {
    ['syncLocation', 'publishLocation'].forEach((type) => {
      (store.getters[`${type}/items`] as Item[]).forEach((item) => {
        if (!idsToKeep[item.id]
          && (store.getters[`${type}/groupedByFileIdAndHash`][item.fileId as string][item.hash as number] as Item[]).length > 1
        ) {
          deleteItemByType(item.type, item.id);
        }
      });
    });
  },

  /**
   * Drop the database and clean the localStorage for the specified workspaceId.
   */
  async removeWorkspace(id: string): Promise<void> {
    // Remove from the store first as workspace tabs will reload.
    // Workspace deletion will be persisted as soon as possible
    // by the useDataStore().workspaces watcher in localDbSvc.
    useWorkspaceStore().removeWorkspace(id);

    // Drop the database
    await new Promise<void>((resolve) => {
      const dbName = utils.getDbName(id);
      const request = indexedDB.deleteDatabase(dbName);
      request.onerror = () => resolve(); // Ignore errors
      request.onsuccess = () => resolve();
    });

    // Clean the local storage
    localStorage.removeItem(`${id}/lastSyncActivity`);
    localStorage.removeItem(`${id}/lastWindowFocus`);
  },
};
