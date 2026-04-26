// HTTP / OAuth plumbing for CouchDB workspace sync. Method params +
// response payloads kept loose (`any`) — vendor APIs return dynamic shapes.
import { useWorkspaceStore } from '../../stores/workspace';
import couchdbHelper from './helpers/couchdbHelper';
import Provider from './common/Provider';
import utils from '../utils';
import badgeSvc from '../badgeSvc';
import { useDataStore } from '../../stores/data';

let syncLastSeq: any;

export default new Provider({
  id: 'couchdbWorkspace',
  name: 'CouchDB',
  getToken(): any {
    return useWorkspaceStore().syncToken;
  },
  getWorkspaceParams({ dbUrl }: any): any {
    return {
      providerId: (this as any).id,
      dbUrl,
    };
  },
  getWorkspaceLocationUrl({ dbUrl }: any): string {
    return dbUrl;
  },
  getSyncDataUrl(fileSyncData: any, { id }: any): string {
    const { dbUrl } = (this as any).getToken();
    return `${dbUrl}/${id}/data`;
  },
  getSyncDataDescription(fileSyncData: any, { id }: any): string {
    return id;
  },
  async initWorkspace(): Promise<any> {
    const self = this as any;
    const dbUrl = ((utils as any).queryParams.dbUrl || '').replace(/\/?$/, ''); // Remove trailing /
    const workspaceParams: any = self.getWorkspaceParams({ dbUrl });
    const workspaceId = (utils as any).makeWorkspaceId(workspaceParams);

    // Create the token if it doesn't exist
    if (!useDataStore().couchdbTokensBySub[workspaceId]) {
      useDataStore().addCouchdbToken({
        sub: workspaceId,
        dbUrl,
      });
    }

    // Create the workspace if it doesn't exist
    if (!useWorkspaceStore().workspacesById[workspaceId]) {
      try {
        // Make sure the database exists and retrieve its name
        const db = await (couchdbHelper as any).getDb(useDataStore().couchdbTokensBySub[workspaceId]);
        useWorkspaceStore().patchWorkspacesById({
          [workspaceId]: {
            id: workspaceId,
            name: db.db_name,
            providerId: self.id,
            dbUrl,
          },
        });
      } catch (e) {
        throw new Error(`${dbUrl} is not accessible. Make sure you have the proper permissions.`);
      }
    }

    (badgeSvc as any).addBadge('addCouchdbWorkspace');
    return useWorkspaceStore().workspacesById[workspaceId];
  },
  async getChanges(): Promise<any> {
    const syncToken = useWorkspaceStore().syncToken;
    const lastSeq = (useDataStore().localSettings as any).syncLastSeq;
    const result = await (couchdbHelper as any).getChanges(syncToken, lastSeq);
    const changes = result.changes.filter((change: any) => {
      if (!change.deleted && change.doc) {
        change.item = change.doc.item;
        if (!change.item || !change.item.id || !change.item.type) {
          return false;
        }
        // Build sync data
        change.syncData = {
          id: change.id,
          itemId: change.item.id,
          type: change.item.type,
          hash: change.item.hash,
          rev: change.doc._rev,
        };
      }
      change.syncDataId = change.id;
      return true;
    });
    syncLastSeq = result.lastSeq;
    return changes;
  },
  onChangesApplied(): void {
    useDataStore().patchLocalSettings({
      syncLastSeq,
    });
  },
  async saveWorkspaceItem({ item, syncData }: any): Promise<any> {
    const syncToken = useWorkspaceStore().syncToken;
    const { id, rev } = await (couchdbHelper as any).uploadDocument({
      token: syncToken,
      item,
      documentId: syncData && syncData.id,
      rev: syncData && syncData.rev,
    });

    // Build sync data to save
    return {
      syncData: {
        id,
        itemId: item.id,
        type: item.type,
        hash: item.hash,
        rev,
      },
    };
  },
  removeWorkspaceItem({ syncData }: any): any {
    const syncToken = useWorkspaceStore().syncToken;
    return (couchdbHelper as any).removeDocument(syncToken, syncData.id, syncData.rev);
  },
  async downloadWorkspaceContent({ token, contentSyncData }: any): Promise<any> {
    const body = await (couchdbHelper as any).retrieveDocumentWithAttachments(token, contentSyncData.id);
    const rev = body._rev;
    const content = Provider.parseContent(body.attachments.data, body.item.id);
    return {
      content,
      contentSyncData: {
        ...contentSyncData,
        hash: content.hash,
        rev,
      },
    };
  },
  async downloadWorkspaceData({ token, syncData }: any): Promise<any> {
    if (!syncData) {
      return {};
    }

    const body = await (couchdbHelper as any).retrieveDocumentWithAttachments(token, syncData.id);
    const item = (utils as any).addItemHash(JSON.parse(body.attachments.data));
    const rev = body._rev;
    return {
      item,
      syncData: {
        ...syncData,
        hash: item.hash,
        rev,
      },
    };
  },
  async uploadWorkspaceContent({ token, content, contentSyncData }: any): Promise<any> {
    const res = await (couchdbHelper as any).uploadDocument({
      token,
      item: {
        id: content.id,
        type: content.type,
        hash: content.hash,
      },
      data: Provider.serializeContent(content),
      dataType: 'text/plain',
      documentId: contentSyncData && contentSyncData.id,
      rev: contentSyncData && contentSyncData.rev,
    });

    // Return new sync data
    return {
      contentSyncData: {
        id: res.id,
        itemId: content.id,
        type: content.type,
        hash: content.hash,
        rev: res.rev,
      },
    };
  },
  async uploadWorkspaceData({ token, item, syncData }: any): Promise<any> {
    const res = await (couchdbHelper as any).uploadDocument({
      token,
      item: {
        id: item.id,
        type: item.type,
        hash: item.hash,
      },
      data: JSON.stringify(item),
      dataType: 'application/json',
      documentId: syncData && syncData.id,
      rev: syncData && syncData.rev,
    });

    // Return new sync data
    return {
      syncData: {
        id: res.id,
        itemId: item.id,
        type: item.type,
        hash: item.hash,
        rev: res.rev,
      },
    };
  },
  async listFileRevisions({ token, contentSyncDataId }: any): Promise<any[]> {
    const body = await (couchdbHelper as any).retrieveDocumentWithRevisions(token, contentSyncDataId);
    const revisions: any[] = [];
    body._revs_info.forEach((revInfo: any, idx: number) => {
      if (revInfo.status === 'available') {
        revisions.push({
          id: revInfo.rev,
          sub: null,
          created: idx,
          loaded: false,
        });
      }
    });
    return revisions;
  },
  async loadFileRevision({ token, contentSyncDataId, revision }: any): Promise<boolean> {
    if (revision.loaded) {
      return false;
    }
    const body = await (couchdbHelper as any).retrieveDocument(token, contentSyncDataId, revision.id);
    revision.sub = body.sub;
    revision.created = body.time;
    revision.loaded = true;
    return true;
  },
  async getFileRevisionContent({ token, contentSyncDataId, revisionId }: any): Promise<any> {
    const body = await (couchdbHelper as any)
      .retrieveDocumentWithAttachments(token, contentSyncDataId, revisionId);
    return Provider.parseContent(body.attachments.data, body.item.id);
  },
});
