// HTTP / OAuth plumbing for GitHub workspace sync. Method params +
// response payloads kept loose (`any`) — vendor APIs return dynamic shapes.
import { useWorkspaceStore } from '../../stores/workspace';
import { useModalStore } from '../../stores/modal';
import githubHelper from './helpers/githubHelper';
import Provider from './common/Provider';
import utils from '../utils';
import userSvc from '../userSvc';
import gitWorkspaceSvc from '../gitWorkspaceSvc';
import badgeSvc from '../badgeSvc';
import { useDataStore } from '../../stores/data';
import { useGlobalStore } from '../../stores/global';

const getAbsolutePath = ({ id }: any): string =>
  `${(useWorkspaceStore().currentWorkspace as any).path || ''}${id}`;

export default new Provider({
  id: 'githubWorkspace',
  name: 'GitHub',
  getToken(): any {
    return useWorkspaceStore().syncToken;
  },
  getWorkspaceParams({
    owner,
    repo,
    branch,
    path,
  }: any): any {
    return {
      providerId: (this as any).id,
      owner,
      repo,
      branch,
      path,
    };
  },
  getWorkspaceLocationUrl({
    owner,
    repo,
    branch,
    path,
  }: any): string {
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree/${encodeURIComponent(branch)}/${(utils as any).encodeUrlPath(path)}`;
  },
  getSyncDataUrl({ id }: any): string {
    const { owner, repo, branch } = useWorkspaceStore().currentWorkspace as any;
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree/${encodeURIComponent(branch)}/${(utils as any).encodeUrlPath(getAbsolutePath({ id }))}`;
  },
  getSyncDataDescription({ id }: any): string {
    return getAbsolutePath({ id });
  },
  async initWorkspace(): Promise<any> {
    const self = this as any;
    const { owner, repo, branch } = (utils as any).queryParams;
    const workspaceParams: any = self.getWorkspaceParams({ owner, repo, branch });
    if (!branch) {
      workspaceParams.branch = 'main';
    }

    // Extract path param
    const path = ((utils as any).queryParams.path || '')
      .trim()
      .replace(/^\/*/, '') // Remove leading `/`
      .replace(/\/*$/, '/'); // Add trailing `/`
    if (path !== '/') {
      workspaceParams.path = path;
    }

    const workspaceId = (utils as any).makeWorkspaceId(workspaceParams);
    const workspace: any = useWorkspaceStore().workspacesById[workspaceId];

    // See if we already have a token
    let token: any;
    if (workspace) {
      // Token sub is in the workspace
      token = useDataStore().githubTokensBySub[workspace.sub];
    }
    if (!token) {
      await useModalStore().open({ type: 'githubAccount' });
      token = await (githubHelper as any).addAccount((useDataStore().localSettings as any).githubRepoFullAccess);
    }

    if (!workspace) {
      const pathEntries = (path || '').split('/');
      const name = pathEntries[pathEntries.length - 2] || repo; // path ends with `/`
      useWorkspaceStore().patchWorkspacesById({
        [workspaceId]: {
          ...workspaceParams,
          id: workspaceId,
          sub: token.sub,
          name,
        },
      });
    }

    (badgeSvc as any).addBadge('addGithubWorkspace');
    return useWorkspaceStore().workspacesById[workspaceId];
  },
  getChanges(): any {
    return (githubHelper as any).getTree({
      ...useWorkspaceStore().currentWorkspace,
      token: (this as any).getToken(),
    });
  },
  prepareChanges(tree: any): any {
    return (gitWorkspaceSvc as any).makeChanges(tree);
  },
  async saveWorkspaceItem({ item }: any): Promise<any> {
    const syncData: any = {
      id: useGlobalStore().gitPathsByItemId[item.id],
      type: item.type,
      hash: item.hash,
    };

    // Files and folders are not in git, only contents
    if (item.type === 'file' || item.type === 'folder') {
      return { syncData };
    }

    // locations are stored as paths, so we upload an empty file
    const syncToken = useWorkspaceStore().syncToken;
    await (githubHelper as any).uploadFile({
      ...useWorkspaceStore().currentWorkspace,
      token: syncToken,
      path: getAbsolutePath(syncData),
      content: '',
      sha: (gitWorkspaceSvc as any).shaByPath[syncData.id],
    });

    // Return sync data to save
    return { syncData };
  },
  async removeWorkspaceItem({ syncData }: any): Promise<void> {
    if ((gitWorkspaceSvc as any).shaByPath[syncData.id]) {
      const syncToken = useWorkspaceStore().syncToken;
      await (githubHelper as any).removeFile({
        ...useWorkspaceStore().currentWorkspace,
        token: syncToken,
        path: getAbsolutePath(syncData),
        sha: (gitWorkspaceSvc as any).shaByPath[syncData.id],
      });
    }
  },
  async downloadWorkspaceContent({
    token,
    contentId,
    contentSyncData,
    fileSyncData,
  }: any): Promise<any> {
    const { sha, data } = await (githubHelper as any).downloadFile({
      ...useWorkspaceStore().currentWorkspace,
      token,
      path: getAbsolutePath(fileSyncData),
    });
    (gitWorkspaceSvc as any).shaByPath[fileSyncData.id] = sha;
    const content = Provider.parseContent(data, contentId);
    return {
      content,
      contentSyncData: {
        ...contentSyncData,
        hash: content.hash,
        sha,
      },
    };
  },
  async downloadWorkspaceData({ token, syncData }: any): Promise<any> {
    if (!syncData) {
      return {};
    }

    const { sha, data } = await (githubHelper as any).downloadFile({
      ...useWorkspaceStore().currentWorkspace,
      token,
      path: getAbsolutePath(syncData),
    });
    (gitWorkspaceSvc as any).shaByPath[syncData.id] = sha;
    const item = JSON.parse(data);
    return {
      item,
      syncData: {
        ...syncData,
        hash: item.hash,
        sha,
      },
    };
  },
  async uploadWorkspaceContent({ token, content, file }: any): Promise<any> {
    const path = useGlobalStore().gitPathsByItemId[file.id];
    const absolutePath = `${(useWorkspaceStore().currentWorkspace as any).path || ''}${path}`;
    const res = await (githubHelper as any).uploadFile({
      ...useWorkspaceStore().currentWorkspace,
      token,
      path: absolutePath,
      content: Provider.serializeContent(content),
      sha: (gitWorkspaceSvc as any).shaByPath[path],
    });

    // Return new sync data
    return {
      contentSyncData: {
        id: useGlobalStore().gitPathsByItemId[content.id],
        type: content.type,
        hash: content.hash,
        sha: res.content.sha,
      },
      fileSyncData: {
        id: path,
        type: 'file',
        hash: file.hash,
      },
    };
  },
  async uploadWorkspaceData({ token, item }: any): Promise<any> {
    const path = useGlobalStore().gitPathsByItemId[item.id];
    const syncData: any = {
      id: path,
      type: item.type,
      hash: item.hash,
    };
    const res = await (githubHelper as any).uploadFile({
      ...useWorkspaceStore().currentWorkspace,
      token,
      path: getAbsolutePath(syncData),
      content: JSON.stringify(item),
      sha: (gitWorkspaceSvc as any).shaByPath[path],
    });

    return {
      syncData: {
        ...syncData,
        sha: res.content.sha,
      },
    };
  },
  async listFileRevisions({ token, fileSyncDataId }: any): Promise<any[]> {
    const { owner, repo, branch } = useWorkspaceStore().currentWorkspace as any;
    const entries = await (githubHelper as any).getCommits({
      token,
      owner,
      repo,
      sha: branch,
      path: getAbsolutePath({ id: fileSyncDataId }),
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
        || (commit.committer && commit.committer.date)
        || 1;
      return {
        id: sha,
        sub,
        created: new Date(date).getTime(),
      };
    });
  },
  async loadFileRevision(): Promise<boolean> {
    // Revisions are already loaded
    return false;
  },
  async getFileRevisionContent({
    token,
    contentId,
    fileSyncDataId,
    revisionId,
  }: any): Promise<any> {
    const { data } = await (githubHelper as any).downloadFile({
      ...useWorkspaceStore().currentWorkspace,
      token,
      branch: revisionId,
      path: getAbsolutePath({ id: fileSyncDataId }),
    });
    return Provider.parseContent(data, contentId);
  },
});
