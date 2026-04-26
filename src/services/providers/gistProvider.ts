// HTTP / OAuth plumbing for GitHub Gist sync. Method params + response
// payloads kept loose (`any`) — the GitHub Gist v3 API returns dynamic
// shapes per endpoint that aren't worth typing in this batch.
import { useFileStore } from '../../stores/file';
import githubHelper from './helpers/githubHelper';
import Provider from './common/Provider';
import utils from '../utils';
import userSvc from '../userSvc';
import { useDataStore } from '../../stores/data';

export default new Provider({
  id: 'gist',
  name: 'Gist',
  getToken({ sub }: any): any {
    return useDataStore().githubTokensBySub[sub];
  },
  getLocationUrl({ gistId }: any): string {
    return `https://gist.github.com/${gistId}`;
  },
  getLocationDescription({ filename }: any): string {
    return filename;
  },
  async downloadContent(token: any, syncLocation: any): Promise<any> {
    const content = await (githubHelper as any).downloadGist({
      ...syncLocation,
      token,
    });
    return Provider.parseContent(content, `${syncLocation.fileId}/content`);
  },
  async uploadContent(token: any, content: any, syncLocation: any): Promise<any> {
    const file = useFileStore().itemsById[syncLocation.fileId];
    const description = (utils as any).sanitizeName(file && file.name);
    const gist = await (githubHelper as any).uploadGist({
      ...syncLocation,
      token,
      description,
      content: Provider.serializeContent(content),
    });
    return {
      ...syncLocation,
      gistId: gist.id,
    };
  },
  async publish(token: any, html: string, metadata: any, publishLocation: any): Promise<any> {
    const gist = await (githubHelper as any).uploadGist({
      ...publishLocation,
      token,
      description: metadata.title,
      content: html,
    });
    return {
      ...publishLocation,
      gistId: gist.id,
    };
  },
  makeLocation(token: any, filename: string, isPublic: boolean, gistId?: string): any {
    return {
      providerId: (this as any).id,
      sub: token.sub,
      filename,
      isPublic,
      gistId,
    };
  },
  async listFileRevisions({ token, syncLocation }: any): Promise<any[]> {
    const entries = await (githubHelper as any).getGistCommits({
      ...syncLocation,
      token,
    });

    return entries.map((entry: any) => {
      const sub = `${(githubHelper as any).subPrefix}:${entry.user.id}`;
      (userSvc as any).addUserInfo({ id: sub, name: entry.user.login, imageUrl: entry.user.avatar_url });
      return {
        sub,
        id: entry.version,
        created: new Date(entry.committed_at).getTime(),
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
    const data = await (githubHelper as any).downloadGistRevision({
      ...syncLocation,
      token,
      sha: revisionId,
    });
    return Provider.parseContent(data, contentId);
  },
});
