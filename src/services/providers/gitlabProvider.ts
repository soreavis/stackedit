// HTTP / OAuth plumbing for GitLab repo sync. Method params + response
// payloads kept loose (`any`) — the GitLab v4 API returns dynamic
// shapes per endpoint that aren't worth typing in this batch.
import { useNotificationStore } from '../../stores/notification';
import gitlabHelper from './helpers/gitlabHelper';
import Provider from './common/Provider';
import utils from '../utils';
import workspaceSvc from '../workspaceSvc';
import userSvc from '../userSvc';
import { useDataStore } from '../../stores/data';
import { useFileStore } from '../../stores/file';

const savedSha: Record<string, string> = {};

export default new Provider({
  id: 'gitlab',
  name: 'GitLab',
  getToken({ sub }: any): any {
    return useDataStore().gitlabTokensBySub[sub];
  },
  getLocationUrl({
    sub,
    projectPath,
    branch,
    path,
  }: any): string {
    const token = (this as any).getToken({ sub });
    return `${token.serverUrl}/${projectPath}/blob/${encodeURIComponent(branch)}/${(utils as any).encodeUrlPath(path)}`;
  },
  getLocationDescription({ path }: any): string {
    return path;
  },
  async downloadContent(token: any, syncLocation: any): Promise<any> {
    const { sha, data } = await (gitlabHelper as any).downloadFile({
      ...syncLocation,
      token,
    });
    savedSha[syncLocation.id] = sha;
    return Provider.parseContent(data, `${syncLocation.fileId}/content`);
  },
  async uploadContent(token: any, content: any, syncLocation: any): Promise<any> {
    const self = this as any;
    const updatedSyncLocation = {
      ...syncLocation,
      projectId: await (gitlabHelper as any).getProjectId(token, syncLocation),
    };
    if (!savedSha[updatedSyncLocation.id]) {
      try {
        // Get the last sha
        await self.downloadContent(token, updatedSyncLocation);
      } catch (e) {
        // Ignore error
      }
    }
    const sha = savedSha[updatedSyncLocation.id];
    delete savedSha[updatedSyncLocation.id];
    await (gitlabHelper as any).uploadFile({
      ...updatedSyncLocation,
      token,
      content: Provider.serializeContent(content),
      sha,
    });
    return updatedSyncLocation;
  },
  async publish(token: any, html: string, metadata: any, publishLocation: any): Promise<any> {
    const self = this as any;
    const updatedPublishLocation = {
      ...publishLocation,
      projectId: await (gitlabHelper as any).getProjectId(token, publishLocation),
    };
    try {
      // Get the last sha
      await self.downloadContent(token, updatedPublishLocation);
    } catch (e) {
      // Ignore error
    }
    const sha = savedSha[updatedPublishLocation.id];
    delete savedSha[updatedPublishLocation.id];
    await (gitlabHelper as any).uploadFile({
      ...updatedPublishLocation,
      token,
      content: html,
      sha,
    });
    return updatedPublishLocation;
  },
  async openFile(token: any, syncLocation: any): Promise<void> {
    const self = this as any;
    const updatedSyncLocation = {
      ...syncLocation,
      projectId: await (gitlabHelper as any).getProjectId(token, syncLocation),
    };

    // Check if the file exists and open it
    if (!Provider.openFileWithLocation(updatedSyncLocation)) {
      // Download content from GitLab
      let content;
      try {
        content = await self.downloadContent(token, updatedSyncLocation);
      } catch (e) {
        useNotificationStore().error(`Could not open file ${updatedSyncLocation.path}.`);
        return;
      }

      // Create the file
      let name = updatedSyncLocation.path;
      const slashPos = name.lastIndexOf('/');
      if (slashPos > -1 && slashPos < name.length - 1) {
        name = name.slice(slashPos + 1);
      }
      const dotPos = name.lastIndexOf('.');
      if (dotPos > 0 && slashPos < name.length) {
        name = name.slice(0, dotPos);
      }
      const item = await (workspaceSvc as any).createFile({
        name,
        parentId: useFileStore().current.parentId,
        text: content.text,
        properties: content.properties,
        discussions: content.discussions,
        comments: content.comments,
      }, true);
      useFileStore().setCurrentId(item.id);
      (workspaceSvc as any).addSyncLocation({
        ...updatedSyncLocation,
        fileId: item.id,
      });
      useNotificationStore().info(`${useFileStore().current.name} was imported from GitLab.`);
    }
  },
  makeLocation(token: any, projectPath: string, branch: string, path: string): any {
    return {
      providerId: (this as any).id,
      sub: token.sub,
      projectPath,
      branch,
      path,
    };
  },
  async listFileRevisions({ token, syncLocation }: any): Promise<any[]> {
    const entries = await (gitlabHelper as any).getCommits({
      ...syncLocation,
      token,
    });

    return entries.map((entry: any) => {
      const email = entry.author_email || entry.committer_email;
      const sub = `${(gitlabHelper as any).subPrefix}:${token.serverUrl}/${email}`;
      (userSvc as any).addUserInfo({
        id: sub,
        name: entry.author_name || entry.committer_name,
        imageUrl: '',
      });
      const date = entry.authored_date || entry.committed_date || 1;
      return {
        id: entry.id,
        sub,
        created: date ? new Date(date).getTime() : 1,
      };
    });
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
    const { data } = await (gitlabHelper as any).downloadFile({
      ...syncLocation,
      token,
      branch: revisionId,
    });
    return Provider.parseContent(data, contentId);
  },
});
