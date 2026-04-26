// HTTP / OAuth plumbing for Google Drive workspace sync. Method params +
// response payloads kept loose (`any`) — vendor APIs return dynamic shapes.
import { useWorkspaceStore } from '../../stores/workspace';
import { useFileStore } from '../../stores/file';
import { useFolderStore } from '../../stores/folder';
import { useModalStore } from '../../stores/modal';
import googleHelper from './helpers/googleHelper';
import Provider from './common/Provider';
import utils from '../utils';
import workspaceSvc from '../workspaceSvc';
import badgeSvc from '../badgeSvc';
import { useDataStore } from '../../stores/data';

let fileIdToOpen: string | null | undefined;
let syncStartPageToken: string | undefined;

export default new Provider({
  id: 'googleDriveWorkspace',
  name: 'Google Drive',
  getToken(): any {
    return useWorkspaceStore().syncToken;
  },
  getWorkspaceParams({ folderId }: any): any {
    return {
      providerId: (this as any).id,
      folderId,
    };
  },
  getWorkspaceLocationUrl({ folderId }: any): string {
    return `https://docs.google.com/folder/d/${folderId}`;
  },
  getSyncDataUrl({ id }: any): string {
    return `https://docs.google.com/file/d/${id}/edit`;
  },
  getSyncDataDescription({ id }: any): string {
    return id;
  },
  async initWorkspace(): Promise<any> {
    const self = this as any;
    const makeWorkspaceId = (folderId: any): any => folderId
      && (utils as any).makeWorkspaceId(self.getWorkspaceParams({ folderId }));

    const getWorkspace = (folderId: any): any =>
      useWorkspaceStore().workspacesById[makeWorkspaceId(folderId)];

    const initFolder = async (token: any, folder: any): Promise<void> => {
      const appProperties: any = {
        folderId: folder.id,
        dataFolderId: folder.appProperties.dataFolderId,
        trashFolderId: folder.appProperties.trashFolderId,
      };

      // Make sure data folder exists
      if (!appProperties.dataFolderId) {
        const dataFolder = await (googleHelper as any).uploadFile({
          token,
          name: '.stackedit-data',
          parents: [folder.id],
          appProperties: { folderId: folder.id },
          mediaType: (googleHelper as any).folderMimeType,
        });
        appProperties.dataFolderId = dataFolder.id;
      }

      // Make sure trash folder exists
      if (!appProperties.trashFolderId) {
        const trashFolder = await (googleHelper as any).uploadFile({
          token,
          name: '.stackedit-trash',
          parents: [folder.id],
          appProperties: { folderId: folder.id },
          mediaType: (googleHelper as any).folderMimeType,
        });
        appProperties.trashFolderId = trashFolder.id;
      }

      // Update workspace if some properties are missing
      if (appProperties.folderId !== folder.appProperties.folderId
        || appProperties.dataFolderId !== folder.appProperties.dataFolderId
        || appProperties.trashFolderId !== folder.appProperties.trashFolderId
      ) {
        await (googleHelper as any).uploadFile({
          token,
          appProperties,
          mediaType: (googleHelper as any).folderMimeType,
          fileId: folder.id,
        });
      }

      // Update workspace in the store
      const workspaceId = makeWorkspaceId(folder.id);
      useWorkspaceStore().patchWorkspacesById({
        [workspaceId]: {
          id: workspaceId,
          sub: token.sub,
          name: folder.name,
          providerId: self.id,
          folderId: folder.id,
          teamDriveId: folder.teamDriveId,
          dataFolderId: appProperties.dataFolderId,
          trashFolderId: appProperties.trashFolderId,
        },
      });
    };

    // Token sub is in the workspace or in the url if workspace is about to be created
    const { sub } = getWorkspace((utils as any).queryParams.folderId) || (utils as any).queryParams;
    // See if we already have a token
    let token = useDataStore().googleTokensBySub[sub];
    // If no token has been found, popup an authorize window and get one
    if (!token || !(token as any).isDrive || !(token as any).driveFullAccess) {
      await useModalStore().open('workspaceGoogleRedirection');
      token = await (googleHelper as any).addDriveAccount(true, (utils as any).queryParams.sub);
    }

    let { folderId } = (utils as any).queryParams;
    // If no folderId is provided, create one
    if (!folderId) {
      const folder = await (googleHelper as any).uploadFile({
        token,
        name: 'StackEdit workspace',
        parents: [],
        mediaType: (googleHelper as any).folderMimeType,
      });
      await initFolder(token, {
        ...folder,
        appProperties: {},
      });
      folderId = folder.id;
    }

    // Init workspace
    if (!getWorkspace(folderId)) {
      let folder: any;
      try {
        folder = await (googleHelper as any).getFile(token, folderId);
      } catch (err) {
        throw new Error(`Folder ${folderId} is not accessible. Make sure you have the right permissions.`);
      }
      folder.appProperties = folder.appProperties || {};
      const folderIdProperty = folder.appProperties.folderId;
      if (folderIdProperty && folderIdProperty !== folderId) {
        throw new Error(`Folder ${folderId} is part of another workspace.`);
      }
      await initFolder(token, folder);
    }

    (badgeSvc as any).addBadge('addGoogleDriveWorkspace');
    return getWorkspace(folderId);
  },
  async performAction(): Promise<void> {
    const state = (googleHelper as any).driveState || {};
    const token = (this as any).getToken();
    switch (token && state.action) {
      case 'create': {
        const driveFolder = (googleHelper as any).driveActionFolder;
        let syncData: any = useDataStore().syncDataById[driveFolder.id];
        if (!syncData && driveFolder.appProperties.id) {
          // Create folder if not already synced
          useFolderStore().setItem({
            id: driveFolder.appProperties.id,
            name: driveFolder.name,
          });
          const item: any = useFolderStore().itemsById[driveFolder.appProperties.id];
          syncData = {
            id: driveFolder.id,
            itemId: item.id,
            type: item.type,
            hash: item.hash,
          };
          useDataStore().patchSyncDataById({
            [syncData.id]: syncData,
          });
        }
        const file = await (workspaceSvc as any).createFile({
          parentId: syncData && syncData.itemId,
        }, true);
        useFileStore().setCurrentId(file.id);
        // File will be created on next workspace sync
        break;
      }
      case 'open': {
        // open first file only
        const firstFile = (googleHelper as any).driveActionFiles[0];
        const syncData: any = useDataStore().syncDataById[firstFile.id];
        if (!syncData) {
          fileIdToOpen = firstFile.id;
        } else {
          useFileStore().setCurrentId(syncData.itemId);
        }
        break;
      }
      default:
    }
  },
  async getChanges(): Promise<any> {
    const workspace: any = useWorkspaceStore().currentWorkspace;
    const syncToken = useWorkspaceStore().syncToken;
    const lastStartPageToken = (useDataStore().localSettings as any).syncStartPageToken;
    const { changes, startPageToken } = await (googleHelper as any)
      .getChanges(syncToken, lastStartPageToken, false, workspace.teamDriveId);

    syncStartPageToken = startPageToken;
    return changes;
  },
  prepareChanges(changes: any): any {
    // Collect possible parent IDs
    const parentIds: any = {};
    Object.entries(useDataStore().syncDataByItemId).forEach(([id, syncData]: any) => {
      parentIds[syncData.id] = id;
    });
    changes.forEach((change: any) => {
      const { id } = (change.file || {}).appProperties || {};
      if (id) {
        parentIds[change.fileId] = id;
      }
    });

    // Collect changes
    const workspace: any = useWorkspaceStore().currentWorkspace;
    const result: any[] = [];
    changes.forEach((change: any) => {
      // Ignore changes on StackEdit own folders
      if (change.fileId === workspace.folderId
        || change.fileId === workspace.dataFolderId
        || change.fileId === workspace.trashFolderId
      ) {
        return;
      }

      let contentChange: any;
      if (change.file) {
        // Ignore changes in files that are not in the workspace
        const { appProperties } = change.file;
        if (!appProperties || appProperties.folderId !== workspace.folderId
        ) {
          return;
        }

        // If change is on a data item
        if (change.file.parents[0] === workspace.dataFolderId) {
          // Data item has a JSON filename
          try {
            change.item = JSON.parse(change.file.name);
          } catch (e) {
            return;
          }
        } else {
          // Change on a file or folder
          const type = change.file.mimeType === (googleHelper as any).folderMimeType
            ? 'folder'
            : 'file';
          const item: any = {
            id: appProperties.id,
            type,
            name: change.file.name,
            parentId: null,
          };

          // Fill parentId
          if (change.file.parents.some((parentId: any) => parentId === workspace.trashFolderId)) {
            item.parentId = 'trash';
          } else {
            change.file.parents.some((parentId: any) => {
              if (!parentIds[parentId]) {
                return false;
              }
              item.parentId = parentIds[parentId];
              return true;
            });
          }
          change.item = (utils as any).addItemHash(item);

          if (type === 'file') {
            // create a fake change as a file content change
            const id = `${appProperties.id}/content`;
            const syncDataId = `${change.fileId}/content`;
            contentChange = {
              item: {
                id,
                type: 'content',
                // Need a truthy value to force saving sync data
                hash: 1,
              },
              syncData: {
                id: syncDataId,
                itemId: id,
                type: 'content',
                // Need a truthy value to force downloading the content
                hash: 1,
              },
              syncDataId,
            };
          }
        }

        // Build sync data
        change.syncData = {
          id: change.fileId,
          parentIds: change.file.parents,
          itemId: change.item.id,
          type: change.item.type,
          hash: change.item.hash,
        };
      } else {
        // Item was removed
        const syncData: any = useDataStore().syncDataById[change.fileId];
        if (syncData && syncData.type === 'file') {
          // create a fake change as a file content change
          contentChange = {
            syncDataId: `${change.fileId}/content`,
          };
        }
      }

      // Push change
      change.syncDataId = change.fileId;
      result.push(change);
      if (contentChange) {
        result.push(contentChange);
      }
    });

    return result;
  },
  onChangesApplied(): void {
    useDataStore().patchLocalSettings({
      syncStartPageToken,
    });
  },
  async saveWorkspaceItem({ item, syncData, ifNotTooLate }: any): Promise<any> {
    const workspace: any = useWorkspaceStore().currentWorkspace;
    const syncToken = useWorkspaceStore().syncToken;
    let file: any;
    if (item.type !== 'file' && item.type !== 'folder') {
      // For sync/publish locations, store item as filename
      file = await (googleHelper as any).uploadFile({
        token: syncToken,
        name: JSON.stringify(item),
        parents: [workspace.dataFolderId],
        appProperties: {
          folderId: workspace.folderId,
        },
        fileId: syncData && syncData.id,
        oldParents: syncData && syncData.parentIds,
        ifNotTooLate,
      });
    } else {
      // For type `file` or `folder`
      const parentSyncData: any = useDataStore().syncDataByItemId[item.parentId];
      let parentId;
      if (item.parentId === 'trash') {
        parentId = workspace.trashFolderId;
      } else if (parentSyncData) {
        parentId = parentSyncData.id;
      } else {
        parentId = workspace.folderId;
      }

      file = await (googleHelper as any).uploadFile({
        token: syncToken,
        name: item.name,
        parents: [parentId],
        appProperties: {
          id: item.id,
          folderId: workspace.folderId,
        },
        mediaType: item.type === 'folder' ? (googleHelper as any).folderMimeType : undefined,
        fileId: syncData && syncData.id,
        oldParents: syncData && syncData.parentIds,
        ifNotTooLate,
      });
    }

    // Build sync data to save
    return {
      syncData: {
        id: file.id,
        parentIds: file.parents,
        itemId: item.id,
        type: item.type,
        hash: item.hash,
      },
    };
  },
  async removeWorkspaceItem({ syncData, ifNotTooLate }: any): Promise<void> {
    // Ignore content deletion
    if (syncData.type !== 'content') {
      const syncToken = useWorkspaceStore().syncToken;
      await (googleHelper as any).removeFile(syncToken, syncData.id, ifNotTooLate);
    }
  },
  async downloadWorkspaceContent({ token, contentSyncData, fileSyncData }: any): Promise<any> {
    const data = await (googleHelper as any).downloadFile(token, fileSyncData.id);
    const content = Provider.parseContent(data, contentSyncData.itemId);

    // Open the file requested by action if it wasn't synced yet
    if (fileIdToOpen && fileIdToOpen === fileSyncData.id) {
      fileIdToOpen = null;
      // Open the file once downloaded content has been stored
      setTimeout(() => {
        useFileStore().setCurrentId(fileSyncData.itemId);
      }, 10);
    }

    return {
      content,
      contentSyncData: {
        ...contentSyncData,
        hash: content.hash,
      },
    };
  },
  async downloadWorkspaceData({ token, syncData }: any): Promise<any> {
    if (!syncData) {
      return {};
    }

    const content = await (googleHelper as any).downloadFile(token, syncData.id);
    const item = JSON.parse(content);
    return {
      item,
      syncData: {
        ...syncData,
        hash: item.hash,
      },
    };
  },
  async uploadWorkspaceContent({
    token,
    content,
    file,
    fileSyncData,
    ifNotTooLate,
  }: any): Promise<any> {
    let gdriveFile: any;
    let newFileSyncData: any;

    if (fileSyncData) {
      // Only update file media
      gdriveFile = await (googleHelper as any).uploadFile({
        token,
        media: Provider.serializeContent(content),
        fileId: fileSyncData.id,
        ifNotTooLate,
      });
    } else {
      // Create file with media
      const workspace: any = useWorkspaceStore().currentWorkspace;
      const parentSyncData: any = useDataStore().syncDataByItemId[file.parentId];
      gdriveFile = await (googleHelper as any).uploadFile({
        token,
        name: file.name,
        parents: [parentSyncData ? parentSyncData.id : workspace.folderId],
        appProperties: {
          id: file.id,
          folderId: workspace.folderId,
        },
        media: Provider.serializeContent(content),
        ifNotTooLate,
      });

      // Create file sync data
      newFileSyncData = {
        id: gdriveFile.id,
        parentIds: gdriveFile.parents,
        itemId: file.id,
        type: file.type,
        hash: file.hash,
      };
    }

    // Return new sync data
    return {
      contentSyncData: {
        id: `${gdriveFile.id}/content`,
        itemId: content.id,
        type: content.type,
        hash: content.hash,
      },
      fileSyncData: newFileSyncData,
    };
  },
  async uploadWorkspaceData({
    token,
    item,
    syncData,
    ifNotTooLate,
  }: any): Promise<any> {
    const workspace: any = useWorkspaceStore().currentWorkspace;
    const file = await (googleHelper as any).uploadFile({
      token,
      name: JSON.stringify({
        id: item.id,
        type: item.type,
        hash: item.hash,
      }),
      parents: [workspace.dataFolderId],
      appProperties: {
        folderId: workspace.folderId,
      },
      media: JSON.stringify(item),
      mediaType: 'application/json',
      fileId: syncData && syncData.id,
      oldParents: syncData && syncData.parentIds,
      ifNotTooLate,
    });

    // Return new sync data
    return {
      syncData: {
        id: file.id,
        parentIds: file.parents,
        itemId: item.id,
        type: item.type,
        hash: item.hash,
      },
    };
  },
  async listFileRevisions({ token, fileSyncDataId }: any): Promise<any[]> {
    const revisions = await (googleHelper as any).getFileRevisions(token, fileSyncDataId);
    return revisions.map((revision: any) => ({
      id: revision.id,
      sub: `${(googleHelper as any).subPrefix}:${revision.lastModifyingUser.permissionId}`,
      created: new Date(revision.modifiedTime).getTime(),
    }));
  },
  async loadFileRevision(): Promise<boolean> {
    // Revision are already loaded
    return false;
  },
  async getFileRevisionContent({
    token,
    contentId,
    fileSyncDataId,
    revisionId,
  }: any): Promise<any> {
    const content = await (googleHelper as any).downloadFileRevision(token, fileSyncDataId, revisionId);
    return Provider.parseContent(content, contentId);
  },
});
