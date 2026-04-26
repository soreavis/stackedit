// HTTP / OAuth plumbing for Google Drive sync. Method params + response
// payloads kept loose (`any`) — Drive v3 API returns dynamic shapes.
import { useWorkspaceStore } from '../../stores/workspace';
import { useModalStore } from '../../stores/modal';
import { useNotificationStore } from '../../stores/notification';
import googleHelper from './helpers/googleHelper';
import Provider from './common/Provider';
import utils from '../utils';
import workspaceSvc from '../workspaceSvc';
import { useQueueStore } from '../../stores/queue';
import { useDataStore } from '../../stores/data';
import { useFileStore } from '../../stores/file';

export default new Provider({
  id: 'googleDrive',
  name: 'Google Drive',
  getToken({ sub }: any): any {
    const token = useDataStore().googleTokensBySub[sub] as any;
    return token && token.isDrive ? token : null;
  },
  getLocationUrl({ driveFileId }: any): string {
    return `https://docs.google.com/file/d/${driveFileId}/edit`;
  },
  getLocationDescription({ driveFileId }: any): string {
    return driveFileId;
  },
  async initAction(): Promise<void> {
    const state = (googleHelper as any).driveState || {};
    if (state.userId) {
      // Try to find the token corresponding to the user ID
      let token = useDataStore().googleTokensBySub[state.userId] as any;
      // If not found or not enough permission, popup an OAuth2 window
      if (!token || !token.isDrive) {
        await useModalStore().open({ type: 'googleDriveAccount' });
        token = await (googleHelper as any).addDriveAccount(
          !(useDataStore().localSettings as any).googleDriveRestrictedAccess,
          state.userId,
        );
      }

      const openWorkspaceIfExists = (file: any): void => {
        const folderId = file
          && file.appProperties
          && file.appProperties.folderId;
        if (folderId) {
          // See if we have the corresponding workspace
          const workspaceParams = {
            providerId: 'googleDriveWorkspace',
            folderId,
          };
          const workspaceId = (utils as any).makeWorkspaceId(workspaceParams);
          const workspace = useWorkspaceStore().workspacesById[workspaceId];
          // If we have the workspace, open it by changing the current URL
          if (workspace) {
            (utils as any).setQueryParams(workspaceParams);
          }
        }
      };

      switch (state.action) {
        case 'create':
        default:
          // See if folder is part of a workspace we can open
          try {
            const folder = await (googleHelper as any).getFile(token, state.folderId);
            folder.appProperties = folder.appProperties || {};
            (googleHelper as any).driveActionFolder = folder;
            openWorkspaceIfExists(folder);
          } catch (err: any) {
            if (!err || err.status !== 404) {
              throw err;
            }
            // We received an HTTP 404 meaning we have no permission to read the folder
            (googleHelper as any).driveActionFolder = { id: state.folderId };
          }
          break;

        case 'open': {
          await (utils as any).awaitSequence(state.ids || [], async (id: string) => {
            const file = await (googleHelper as any).getFile(token, id);
            file.appProperties = file.appProperties || {};
            (googleHelper as any).driveActionFiles.push(file);
          });

          // Check if first file is part of a workspace
          openWorkspaceIfExists((googleHelper as any).driveActionFiles[0]);
        }
      }
    }
  },
  async performAction(): Promise<any> {
    const self = this as any;
    const state = (googleHelper as any).driveState || {};
    const token = useDataStore().googleTokensBySub[state.userId];
    switch (token && state.action) {
      case 'create': {
        const file = await (workspaceSvc as any).createFile({}, true);
        useFileStore().setCurrentId(file.id);
        // Return a new syncLocation
        return self.makeLocation(token, null, (googleHelper as any).driveActionFolder.id);
      }
      case 'open':
        useQueueStore().enqueue(
          () => self.openFiles(token, (googleHelper as any).driveActionFiles),
        );
        return null;
      default:
        return null;
    }
  },
  async downloadContent(token: any, syncLocation: any): Promise<any> {
    const content = await (googleHelper as any).downloadFile(token, syncLocation.driveFileId);
    return Provider.parseContent(content, `${syncLocation.fileId}/content`);
  },
  async uploadContent(token: any, content: any, syncLocation: any, ifNotTooLate?: any): Promise<any> {
    const file = useFileStore().itemsById[syncLocation.fileId];
    const name = (utils as any).sanitizeName(file && file.name);
    const parents: string[] = [];
    if (syncLocation.driveParentId) {
      parents.push(syncLocation.driveParentId);
    }
    const driveFile = await (googleHelper as any).uploadFile({
      token,
      name,
      parents,
      media: Provider.serializeContent(content),
      fileId: syncLocation.driveFileId,
      ifNotTooLate,
    });
    return {
      ...syncLocation,
      driveFileId: driveFile.id,
    };
  },
  async publish(token: any, html: string, metadata: any, publishLocation: any): Promise<any> {
    const driveFile = await (googleHelper as any).uploadFile({
      token,
      name: metadata.title,
      parents: [],
      media: html,
      mediaType: publishLocation.templateId ? 'text/html' : undefined,
      fileId: publishLocation.driveFileId,
    });
    return {
      ...publishLocation,
      driveFileId: driveFile.id,
    };
  },
  async openFiles(token: any, driveFiles: any[]): Promise<any> {
    const self = this as any;
    return (utils as any).awaitSequence(driveFiles, async (driveFile: any) => {
      // Check if the file exists and open it
      if (!Provider.openFileWithLocation({
        providerId: self.id,
        driveFileId: driveFile.id,
      })) {
        // Download content from Google Drive
        const syncLocation = {
          driveFileId: driveFile.id,
          providerId: self.id,
          sub: token.sub,
        };
        let content;
        try {
          content = await self.downloadContent(token, syncLocation);
        } catch (e) {
          useNotificationStore().error(`Could not open file ${driveFile.id}.`);
          return;
        }

        // Create the file
        const item = await (workspaceSvc as any).createFile({
          name: driveFile.name,
          parentId: useFileStore().current.parentId,
          text: content.text,
          properties: content.properties,
          discussions: content.discussions,
          comments: content.comments,
        }, true);
        useFileStore().setCurrentId(item.id);
        (workspaceSvc as any).addSyncLocation({
          ...syncLocation,
          fileId: item.id,
        });
        useNotificationStore().info(`${useFileStore().current.name} was imported from Google Drive.`);
      }
    });
  },
  makeLocation(token: any, fileId: string | null, folderId?: string | null): any {
    const location: any = {
      providerId: (this as any).id,
      sub: token.sub,
    };
    if (fileId) {
      location.driveFileId = fileId;
    }
    if (folderId) {
      location.driveParentId = folderId;
    }
    return location;
  },
  async listFileRevisions({ token, syncLocation }: any): Promise<any[]> {
    const revisions = await (googleHelper as any).getFileRevisions(token, syncLocation.driveFileId);
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
    syncLocation,
    revisionId,
  }: any): Promise<any> {
    const content = await (googleHelper as any)
      .downloadFileRevision(token, syncLocation.driveFileId, revisionId);
    return Provider.parseContent(content, contentId);
  },
});
