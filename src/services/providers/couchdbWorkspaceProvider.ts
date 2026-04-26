// @ts-nocheck
// Provider/helper module — HTTP / OAuth / API plumbing for an external
// sync service. Typed boundary work pending: response shapes vary by
// provider, error handling is dynamic. .ts rename is for migration
// tracking; full typing requires per-provider response interfaces.
import { useWorkspaceStore } from '../../stores/workspace';
import couchdbHelper from './helpers/couchdbHelper';
import Provider from './common/Provider';
import utils from '../utils';
import badgeSvc from '../badgeSvc';
import { useDataStore } from '../../stores/data';

let syncLastSeq;

export default new Provider({
  id: 'couchdbWorkspace',
  name: 'CouchDB',
  getToken() {
    return useWorkspaceStore().syncToken;
  },
  getWorkspaceParams({ dbUrl }) {
    return {
      providerId: this.id,
      dbUrl,
    };
  },
  getWorkspaceLocationUrl({ dbUrl }) {
    return dbUrl;
  },
  getSyncDataUrl(fileSyncData, { id }) {
    const { dbUrl } = this.getToken();
    return `${dbUrl}/${id}/data`;
  },
  getSyncDataDescription(fileSyncData, { id }) {
    return id;
  },
  async initWorkspace() {
    const dbUrl = (utils.queryParams.dbUrl || '').replace(/\/?$/, ''); // Remove trailing /
    const workspaceParams = this.getWorkspaceParams({ dbUrl });
    const workspaceId = utils.makeWorkspaceId(workspaceParams);

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
        const db = await couchdbHelper.getDb(useDataStore().couchdbTokensBySub[workspaceId]);
        useWorkspaceStore().patchWorkspacesById({
          [workspaceId]: {
            id: workspaceId,
            name: db.db_name,
            providerId: this.id,
            dbUrl,
          },
        });
      } catch (e) {
        throw new Error(`${dbUrl} is not accessible. Make sure you have the proper permissions.`);
      }
    }

    badgeSvc.addBadge('addCouchdbWorkspace');
    return useWorkspaceStore().workspacesById[workspaceId];
  },
  async getChanges() {
    const syncToken = useWorkspaceStore().syncToken;
    const lastSeq = useDataStore().localSettings.syncLastSeq;
    const result = await couchdbHelper.getChanges(syncToken, lastSeq);
    const changes = result.changes.filter((change) => {
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
  onChangesApplied() {
    useDataStore().patchLocalSettings({
      syncLastSeq,
    });
  },
  async saveWorkspaceItem({ item, syncData }) {
    const syncToken = useWorkspaceStore().syncToken;
    const { id, rev } = await couchdbHelper.uploadDocument({
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
  removeWorkspaceItem({ syncData }) {
    const syncToken = useWorkspaceStore().syncToken;
    return couchdbHelper.removeDocument(syncToken, syncData.id, syncData.rev);
  },
  async downloadWorkspaceContent({ token, contentSyncData }) {
    const body = await couchdbHelper.retrieveDocumentWithAttachments(token, contentSyncData.id);
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
  async downloadWorkspaceData({ token, syncData }) {
    if (!syncData) {
      return {};
    }

    const body = await couchdbHelper.retrieveDocumentWithAttachments(token, syncData.id);
    const item = utils.addItemHash(JSON.parse(body.attachments.data));
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
  async uploadWorkspaceContent({ token, content, contentSyncData }) {
    const res = await couchdbHelper.uploadDocument({
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
  async uploadWorkspaceData({ token, item, syncData }) {
    const res = await couchdbHelper.uploadDocument({
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
  async listFileRevisions({ token, contentSyncDataId }) {
    const body = await couchdbHelper.retrieveDocumentWithRevisions(token, contentSyncDataId);
    const revisions = [];
    body._revs_info.forEach((revInfo, idx) => {  
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
  async loadFileRevision({ token, contentSyncDataId, revision }) {
    if (revision.loaded) {
      return false;
    }
    const body = await couchdbHelper.retrieveDocument(token, contentSyncDataId, revision.id);
    revision.sub = body.sub;
    revision.created = body.time;
    revision.loaded = true;
    return true;
  },
  async getFileRevisionContent({ token, contentSyncDataId, revisionId }) {
    const body = await couchdbHelper
      .retrieveDocumentWithAttachments(token, contentSyncDataId, revisionId);
    return Provider.parseContent(body.attachments.data, body.item.id);
  },
});
