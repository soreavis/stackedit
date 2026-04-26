import { useWorkspaceStore } from '../stores/workspace';
import utils from '../services/utils';
import { useDataStore } from '../stores/data';
import { useGlobalStore } from '../stores/global';

interface TreeEntry {
  type: string;
  path: string;
  sha: string;
}

interface SyncDataLike {
  hash?: number;
  sha?: string;
  [key: string]: unknown;
}

interface ItemLike {
  id: string;
  type: string;
  hash?: number;
  [key: string]: unknown;
}

interface Change {
  syncDataId: string;
  item?: ItemLike;
  syncData?: SyncDataLike;
}

const endsWith = (str: string, suffix: string): boolean => str.slice(-suffix.length) === suffix;

export default {
  shaByPath: Object.create(null) as Record<string, string>,
  makeChanges(tree: TreeEntry[]): Change[] {
    const workspacePath: string = (useWorkspaceStore().currentWorkspace.path as string) || '';

    // Store all blobs sha
    this.shaByPath = Object.create(null);
    // Store interesting paths
    const treeFolderMap: Record<string, string> = Object.create(null);
    const treeFileMap: Record<string, string> = Object.create(null);
    const treeDataMap: Record<string, boolean> = Object.create(null);
    const treeSyncLocationMap: Record<string, boolean> = Object.create(null);
    const treePublishLocationMap: Record<string, boolean> = Object.create(null);

    tree.filter(({ type, path }) => type === 'blob' && path.indexOf(workspacePath) === 0)
      .forEach((blobEntry) => {
        // Make path relative
        const path = blobEntry.path.slice(workspacePath.length);
        // Collect blob sha
        this.shaByPath[path] = blobEntry.sha;
        if (path.indexOf('.stackedit-data/') === 0) {
          treeDataMap[path] = true;
        } else {
          // Collect parents path
          let parentPath = '';
          path.split('/').slice(0, -1).forEach((folderName) => {
            const folderPath = `${parentPath}${folderName}/`;
            treeFolderMap[folderPath] = parentPath;
            parentPath = folderPath;
          });
          // Collect file path
          if (endsWith(path, '.md')) {
            treeFileMap[path] = parentPath;
          } else if (endsWith(path, '.sync')) {
            treeSyncLocationMap[path] = true;
          } else if (endsWith(path, '.publish')) {
            treePublishLocationMap[path] = true;
          }
        }
      });

    // Collect changes
    const changes: Change[] = [];
    const idsByPath: Record<string, string> = {};
    const syncDataByPath: Record<string, SyncDataLike> = useDataStore().syncDataById;
    const itemIdsByGitPath: Record<string, string> = useGlobalStore().itemIdsByGitPath as any;
    const getIdFromPath = (path: string, isFile = false): string => {
      let itemId = idsByPath[path];
      if (!itemId) {
        const existingItemId = itemIdsByGitPath[path];
        if (existingItemId
          // Reuse a file ID only if it has already been synced
          && (!isFile || syncDataByPath[path]
          // Content may have already been synced
          || syncDataByPath[`/${path}`])
        ) {
          itemId = existingItemId;
        } else {
          // Otherwise, make a new ID for a new item
          itemId = utils.uid();
        }
        // If it's a file path, add the content path as well
        if (isFile) {
          idsByPath[`/${path}`] = `${itemId}/content`;
        }
        idsByPath[path] = itemId;
      }
      return itemId;
    };

    // Folder creations/updates
    // Assume map entries are sorted from top to bottom
    Object.entries(treeFolderMap).forEach(([path, parentPath]) => {
      if (path === '.stackedit-trash/') {
        idsByPath[path] = 'trash';
      } else {
        const item: ItemLike = utils.addItemHash({
          id: getIdFromPath(path),
          type: 'folder',
          name: path.slice(parentPath.length, -1),
          parentId: idsByPath[parentPath] || null,
        });

        const folderSyncData = syncDataByPath[path];
        if (!folderSyncData || folderSyncData.hash !== item.hash) {
          changes.push({
            syncDataId: path,
            item,
            syncData: {
              id: path,
              type: item.type,
              hash: item.hash,
            },
          });
        }
      }
    });

    // File/content creations/updates
    Object.entries(treeFileMap).forEach(([path, parentPath]) => {
      const fileId = getIdFromPath(path, true);
      const contentPath = `/${path}`;
      const contentId = idsByPath[contentPath];

      // File creations/updates
      const item: ItemLike = utils.addItemHash({
        id: fileId,
        type: 'file',
        name: path.slice(parentPath.length, -'.md'.length),
        parentId: idsByPath[parentPath] || null,
      });

      const fileSyncData = syncDataByPath[path];
      if (!fileSyncData || fileSyncData.hash !== item.hash) {
        changes.push({
          syncDataId: path,
          item,
          syncData: {
            id: path,
            type: item.type,
            hash: item.hash,
          },
        });
      }

      // Content creations/updates
      const contentSyncData = syncDataByPath[contentPath];
      if (!contentSyncData || contentSyncData.sha !== this.shaByPath[path]) {
        const type = 'content';
        // Use `/` as a prefix to get a unique syncData id
        changes.push({
          syncDataId: contentPath,
          item: {
            id: contentId,
            type,
            // Need a truthy value to force downloading the content
            hash: 1,
          },
          syncData: {
            id: contentPath,
            type,
            // Need a truthy value to force downloading the content
            hash: 1,
          },
        });
      }
    });

    // Data creations/updates
    const syncDataByItemId: Record<string, SyncDataLike> = useDataStore().syncDataByItemId as Record<string, SyncDataLike>;
    Object.keys(treeDataMap).forEach((path) => {
      // Only template data are stored
      const [, id] = path.match(/^\.stackedit-data\/(templates)\.json$/) || [];
      if (id) {
        idsByPath[path] = id;
        const syncData = syncDataByItemId[id];
        if (!syncData || syncData.sha !== this.shaByPath[path]) {
          const type = 'data';
          changes.push({
            syncDataId: path,
            item: {
              id,
              type,
              // Need a truthy value to force saving sync data
              hash: 1,
            },
            syncData: {
              id: path,
              type,
              // Need a truthy value to force downloading the content
              hash: 1,
            },
          });
        }
      }
    });

    // Location creations/updates
    [{
      type: 'syncLocation',
      map: treeSyncLocationMap,
      pathMatcher: /^([\s\S]+)\.([\w-]+)\.sync$/,
    }, {
      type: 'publishLocation',
      map: treePublishLocationMap,
      pathMatcher: /^([\s\S]+)\.([\w-]+)\.publish$/,
    }]
      .forEach(({ type, map, pathMatcher }) => Object.keys(map).forEach((path) => {
        const [, filePath, data] = path.match(pathMatcher) || [];
        if (filePath) {
          // If there is a corresponding md file in the tree
          const fileId = idsByPath[`${filePath}.md`];
          if (fileId) {
            // Reuse existing ID or create a new one
            const id = itemIdsByGitPath[path] || utils.uid();
            idsByPath[path] = id;

            const item: ItemLike = utils.addItemHash({
              ...JSON.parse(utils.decodeBase64(data)),
              id,
              type,
              fileId,
            });

            const locationSyncData = syncDataByPath[path];
            if (!locationSyncData || locationSyncData.hash !== item.hash) {
              changes.push({
                syncDataId: path,
                item,
                syncData: {
                  id: path,
                  type: item.type,
                  hash: item.hash,
                },
              });
            }
          }
        }
      }));

    // Deletions
    Object.keys(syncDataByPath).forEach((path) => {
      if (!idsByPath[path]) {
        changes.push({ syncDataId: path });
      }
    });

    return changes;
  },
};
