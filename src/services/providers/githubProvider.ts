// HTTP / OAuth plumbing for GitHub repo sync. Method params + response
// payloads kept loose (`any`) — the GitHub v3 API returns dynamic shapes
// per endpoint that aren't worth typing in this batch.
import { useNotificationStore } from '../../stores/notification';
import githubHelper from './helpers/githubHelper';
import Provider from './common/Provider';
import utils from '../utils';
import workspaceSvc from '../workspaceSvc';
import userSvc from '../userSvc';
import { useDataStore } from '../../stores/data';
import { useFileStore } from '../../stores/file';

const savedSha: Record<string, string> = {};

export default new Provider({
  id: 'github',
  name: 'GitHub',
  getToken({ sub }: any): any {
    return useDataStore().githubTokensBySub[sub];
  },
  getLocationUrl({
    owner,
    repo,
    branch,
    path,
  }: any): string {
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree/${encodeURIComponent(branch)}/${(utils as any).encodeUrlPath(path)}`;
  },
  getLocationDescription({ path }: any): string {
    return path;
  },
  async downloadContent(token: any, syncLocation: any): Promise<any> {
    const { sha, data } = await (githubHelper as any).downloadFile({
      ...syncLocation,
      token,
    });
    savedSha[syncLocation.id] = sha;
    return Provider.parseContent(data, `${syncLocation.fileId}/content`);
  },
  async uploadContent(token: any, content: any, syncLocation: any): Promise<any> {
    const self = this as any;
    if (!savedSha[syncLocation.id]) {
      try {
        // Get the last sha
        await self.downloadContent(token, syncLocation);
      } catch (e) {
        // Ignore error
      }
    }
    const sha = savedSha[syncLocation.id];
    delete savedSha[syncLocation.id];
    await (githubHelper as any).uploadFile({
      ...syncLocation,
      token,
      content: Provider.serializeContent(content),
      sha,
    });
    return syncLocation;
  },
  async publish(token: any, html: string, metadata: any, publishLocation: any): Promise<any> {
    const self = this as any;
    try {
      // Get the last sha
      await self.downloadContent(token, publishLocation);
    } catch (e) {
      // Ignore error
    }
    const sha = savedSha[publishLocation.id];
    delete savedSha[publishLocation.id];
    await (githubHelper as any).uploadFile({
      ...publishLocation,
      token,
      content: html,
      sha,
    });
    return publishLocation;
  },
  async openFile(token: any, syncLocation: any): Promise<void> {
    const self = this as any;
    // Check if the file exists and open it
    if (!Provider.openFileWithLocation(syncLocation)) {
      // Download content from GitHub
      let content;
      try {
        content = await self.downloadContent(token, syncLocation);
      } catch (e) {
        useNotificationStore().error(`Could not open file ${syncLocation.path}.`);
        return;
      }

      // Create the file
      let name = syncLocation.path;
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
        ...syncLocation,
        fileId: item.id,
      });
      useNotificationStore().info(`${useFileStore().current.name} was imported from GitHub.`);
    }
  },
  makeLocation(token: any, owner: string, repo: string, branch: string, path: string): any {
    return {
      providerId: (this as any).id,
      sub: token.sub,
      owner,
      repo,
      branch,
      path,
    };
  },
  async listFileRevisions({ token, syncLocation }: any): Promise<any[]> {
    const entries = await (githubHelper as any).getCommits({
      ...syncLocation,
      token,
    });

    return entries.map(({
      author,
      committer,
      commit,
      sha,
    }: any) => {
      let user: any;
      if (author && author.login) {
        user = author;
      } else if (committer && committer.login) {
        user = committer;
      }
      const sub = `${(githubHelper as any).subPrefix}:${user.id}`;
      (userSvc as any).addUserInfo({ id: sub, name: user.login, imageUrl: user.avatar_url });
      const date = (commit.author && commit.author.date)
        || (commit.committer && commit.committer.date);
      return {
        id: sha,
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
    const { data } = await (githubHelper as any).downloadFile({
      ...syncLocation,
      token,
      branch: revisionId,
    });
    return Provider.parseContent(data, contentId);
  },
});
