import store from '../store';
import utils from './utils';
import constants from '../data/constants';
import badgeSvc from './badgeSvc';

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
      text: utils.sanitizeText(text || store.getters['data/computedSettings'].newFileContent),
      properties: utils
        .sanitizeText(properties || store.getters['data/computedSettings'].newFileProperties),
      discussions: discussions || {},
      comments: comments || {},
    };
    const workspaceUniquePaths = store.getters['workspace/currentWorkspaceHasUniquePaths'];

    // Show warning dialogs
    if (!background) {
      // If name is being stripped
      if (item.name !== constants.defaultName && item.name !== name) {
        await store.dispatch('modal/open', {
          type: 'stripName',
          item,
        });
      }

      // Check if there is already a file with that path
      if (workspaceUniquePaths) {
        const parentPath = store.getters.pathsByItemId[item.parentId as string] || '';
        const path = parentPath + item.name;
        if (store.getters.itemsByPath[path]) {
          await store.dispatch('modal/open', {
            type: 'pathConflict',
            item,
          });
        }
      }
    }

    // Save file and content in the store
    store.commit('content/setItem', content);
    store.commit('file/setItem', item);
    if (workspaceUniquePaths) {
      this.makePathUnique(id);
    }

    // Return the new file item
    return store.state.file.itemsById[id];
  },

  /**
   * Make sanity checks and then create/update the folder/file in the store.
   */
  async storeItem(item: Item): Promise<Item | null> {
    const id = item.id || utils.uid();
    const sanitizedName = utils.sanitizeFilename(item.name);

    if (item.type === 'folder' && forbiddenFolderNameMatcher.exec(sanitizedName)) {
      await store.dispatch('modal/open', {
        type: 'unauthorizedName',
        item,
      });
      throw new Error('Unauthorized name.');
    }

    // Show warning dialogs
    // If name has been stripped
    if (sanitizedName !== constants.defaultName && sanitizedName !== item.name) {
      await store.dispatch('modal/open', {
        type: 'stripName',
        item,
      });
    }

    // Check if there is a path conflict
    if (store.getters['workspace/currentWorkspaceHasUniquePaths']) {
      const parentPath = store.getters.pathsByItemId[item.parentId as string] || '';
      const path = parentPath + sanitizedName;
      const items: Item[] = store.getters.itemsByPath[path] || [];
      if (items.some(itemWithSamePath => itemWithSamePath.id !== id)) {
        await store.dispatch('modal/open', {
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
    store.commit(`${item.type}/setItem`, item);

    // Remove circular reference
    this.removeCircularReference(item);

    // Ensure path uniqueness
    if (store.getters['workspace/currentWorkspaceHasUniquePaths']) {
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
    store.commit('file/deleteItem', fileId);
    // Delete the content
    store.commit('content/deleteItem', `${fileId}/content`);
    // Delete the syncedContent
    store.commit('syncedContent/deleteItem', `${fileId}/syncedContent`);
    // Delete the contentState
    store.commit('contentState/deleteItem', `${fileId}/contentState`);
    // Delete sync locations
    ((store.getters['syncLocation/groupedByFileId'][fileId] || []) as Item[])
      .forEach(item => store.commit('syncLocation/deleteItem', item.id));
    // Delete publish locations
    ((store.getters['publishLocation/groupedByFileId'][fileId] || []) as Item[])
      .forEach(item => store.commit('publishLocation/deleteItem', item.id));
  },

  /**
   * Sanitize the whole workspace.
   */
  sanitizeWorkspace(idsToKeep?: Record<string, boolean>): void {
    // Detect and remove circular references for all folders.
    (store.getters['folder/items'] as Item[]).forEach(folder => this.removeCircularReference(folder));

    this.ensureUniquePaths(idsToKeep);
    this.ensureUniqueLocations(idsToKeep);
  },

  /**
   * Detect and remove circular reference for an item.
   */
  removeCircularReference(item: Item): void {
    const foldersById: Record<string, Item> = store.state.folder.itemsById;
    for (
      let parentFolder = foldersById[item.parentId as string];
      parentFolder;
      parentFolder = foldersById[parentFolder.parentId as string]
    ) {
      if (parentFolder.id === item.id) {
        store.commit('folder/patchItem', {
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
    if (store.getters['workspace/currentWorkspaceHasUniquePaths']) {
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
        store.commit(`${item.type}/patchItem`, {
          id: item.id,
          name: `${item.name}.${suffix}`,
        });
        return true;
      }
    }
  },

  addSyncLocation(location: Location): void {
    store.commit('syncLocation/setItem', {
      ...location,
      id: utils.uid(),
    });

    // Sanitize the workspace
    this.ensureUniqueLocations();

    if (Object.keys(store.getters['syncLocation/currentWithWorkspaceSyncLocation']).length > 1) {
      badgeSvc.addBadge('syncMultipleLocations');
    }
  },

  addPublishLocation(location: Location): void {
    store.commit('publishLocation/setItem', {
      ...location,
      id: utils.uid(),
    });

    // Sanitize the workspace
    this.ensureUniqueLocations();

    if (Object.keys(store.getters['publishLocation/current']).length > 1) {
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
          store.commit(`${item.type}/deleteItem`, item.id);
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
    // by the store.getters['data/workspaces'] watcher in localDbSvc.
    store.dispatch('workspace/removeWorkspace', id);

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
