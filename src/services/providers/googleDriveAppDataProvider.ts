// HTTP / OAuth plumbing for Google Drive AppData (the main workspace).
// Method params + response payloads kept loose (`any`) — Drive v3 API
// returns dynamic shapes per endpoint.
import { useWorkspaceStore } from '../../stores/workspace';
import googleHelper from './helpers/googleHelper';
import Provider from './common/Provider';
import utils from '../utils';
import { useDataStore } from '../../stores/data';

let syncStartPageToken: string | undefined;

export default new Provider({
  id: 'googleDriveAppData',
  name: 'Google Drive app data',
  getToken(): any {
    return (useWorkspaceStore() as any).syncToken;
  },
  getWorkspaceParams(): any {
    // No param as it's the main workspace
    return {};
  },
  getWorkspaceLocationUrl(): string | null {
    // No direct link to app data
    return null;
  },
  getSyncDataUrl(): string | null {
    // No direct link to app data
    return null;
  },
  getSyncDataDescription({ id }: any): string {
    return id;
  },
  async initWorkspace(): Promise<any> {
    // Nothing much to do since the main workspace isn't necessarily synchronized
    // Return the main workspace
    return useWorkspaceStore().workspacesById.main;
  },
  async getChanges(): Promise<any[]> {
    const syncToken = (useWorkspaceStore() as any).syncToken;
    const startPageToken = (useDataStore().localSettings as any).syncStartPageToken;
    const result = await (googleHelper as any).getChanges(syncToken, startPageToken, true);
    const changes = result.changes.filter((change: any) => {
      if (change.file) {
        // Parse item from file name
        try {
          change.item = JSON.parse(change.file.name);
        } catch (e) {
          return false;
        }
        // Build sync data
        change.syncData = {
          id: change.fileId,
          itemId: change.item.id,
          type: change.item.type,
          hash: change.item.hash,
        };
      }
      change.syncDataId = change.fileId;
      return true;
    });
    syncStartPageToken = result.startPageToken;
    return changes;
  },
  onChangesApplied(): void {
    useDataStore().patchLocalSettings({
      syncStartPageToken,
    });
  },
  async saveWorkspaceItem({ item, syncData, ifNotTooLate }: any): Promise<any> {
    const syncToken = (useWorkspaceStore() as any).syncToken;
    const file = await (googleHelper as any).uploadAppDataFile({
      token: syncToken,
      name: JSON.stringify(item),
      fileId: syncData && syncData.id,
      ifNotTooLate,
    });

    // Build sync data to save
    return {
      syncData: {
        id: file.id,
        itemId: item.id,
        type: item.type,
        hash: item.hash,
      },
    };
  },
  removeWorkspaceItem({ syncData, ifNotTooLate }: any): any {
    const syncToken = (useWorkspaceStore() as any).syncToken;
    return (googleHelper as any).removeAppDataFile(syncToken, syncData.id, ifNotTooLate);
  },
  async downloadWorkspaceContent({ token, contentSyncData }: any): Promise<any> {
    const data = await (googleHelper as any).downloadAppDataFile(token, contentSyncData.id);
    const content = (utils as any).addItemHash(JSON.parse(data));
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

    const data = await (googleHelper as any).downloadAppDataFile(token, syncData.id);
    const item = (utils as any).addItemHash(JSON.parse(data));
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
    contentSyncData,
    ifNotTooLate,
  }: any): Promise<any> {
    const gdriveFile = await (googleHelper as any).uploadAppDataFile({
      token,
      name: JSON.stringify({
        id: content.id,
        type: content.type,
        hash: content.hash,
      }),
      media: JSON.stringify(content),
      fileId: contentSyncData && contentSyncData.id,
      ifNotTooLate,
    });

    // Return new sync data
    return {
      contentSyncData: {
        id: gdriveFile.id,
        itemId: content.id,
        type: content.type,
        hash: content.hash,
      },
    };
  },
  async uploadWorkspaceData({
    token,
    item,
    syncData,
    ifNotTooLate,
  }: any): Promise<any> {
    const file = await (googleHelper as any).uploadAppDataFile({
      token,
      name: JSON.stringify({
        id: item.id,
        type: item.type,
        hash: item.hash,
      }),
      media: JSON.stringify(item),
      fileId: syncData && syncData.id,
      ifNotTooLate,
    });

    // Return new sync data
    return {
      syncData: {
        id: file.id,
        itemId: item.id,
        type: item.type,
        hash: item.hash,
      },
    };
  },
  async listFileRevisions({ token, contentSyncDataId }: any): Promise<any[]> {
    const revisions = await (googleHelper as any).getAppDataFileRevisions(token, contentSyncDataId);
    return revisions.map((revision: any) => ({
      id: revision.id,
      sub: `${(googleHelper as any).subPrefix}:${revision.lastModifyingUser.permissionId}`,
      created: new Date(revision.modifiedTime).getTime(),
    }));
  },
  async loadFileRevision(): Promise<boolean> {
    // Revisions are already loaded
    return false;
  },
  async getFileRevisionContent({ token, contentSyncDataId, revisionId }: any): Promise<any> {
    const content = await (googleHelper as any)
      .downloadAppDataFileRevision(token, contentSyncDataId, revisionId);
    return JSON.parse(content);
  },
});
