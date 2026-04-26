// HTTP / OAuth plumbing for GitLab workspace sync. Method params +
// response payloads kept loose (`any`) — vendor APIs return dynamic shapes.
import { useWorkspaceStore } from '../../stores/workspace';
import { useModalStore } from '../../stores/modal';
import gitlabHelper from './helpers/gitlabHelper';
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
  id: 'gitlabWorkspace',
  name: 'GitLab',
  getToken(): any {
    return useWorkspaceStore().syncToken;
  },
  getWorkspaceParams({
    serverUrl,
    projectPath,
    branch,
    path,
  }: any): any {
    return {
      providerId: (this as any).id,
      serverUrl,
      projectPath,
      branch,
      path,
    };
  },
  getWorkspaceLocationUrl({
    serverUrl,
    projectPath,
    branch,
    path,
  }: any): string {
    return `${serverUrl}/${projectPath}/blob/${encodeURIComponent(branch)}/${(utils as any).encodeUrlPath(path)}`;
  },
  getSyncDataUrl({ id }: any): string {
    const { projectPath, branch } = useWorkspaceStore().currentWorkspace as any;
    const { serverUrl } = (this as any).getToken();
    return `${serverUrl}/${projectPath}/blob/${encodeURIComponent(branch)}/${(utils as any).encodeUrlPath(getAbsolutePath({ id }))}`;
  },
  getSyncDataDescription({ id }: any): string {
    return getAbsolutePath({ id });
  },
  async initWorkspace(): Promise<any> {
    const self = this as any;
    const { serverUrl, branch } = (utils as any).queryParams;
    const workspaceParams: any = self.getWorkspaceParams({ serverUrl, branch });
    if (!branch) {
      workspaceParams.branch = 'main';
    }

    // Extract project path param
    const projectPath = ((utils as any).queryParams.projectPath || '')
      .trim()
      .replace(/^\/*/, '') // Remove leading `/`
      .replace(/\/*$/, ''); // Remove trailing `/`
    workspaceParams.projectPath = projectPath;

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
    const sub = workspace ? workspace.sub : (utils as any).queryParams.sub;
    let token: any = useDataStore().gitlabTokensBySub[sub];
    if (!token) {
      const { applicationId } = await useModalStore().open({
        type: 'gitlabAccount',
        forceServerUrl: serverUrl,
      }) as any;
      token = await (gitlabHelper as any).addAccount(serverUrl, applicationId, sub);
    }

    if (!workspace) {
      const projectId = await (gitlabHelper as any).getProjectId(token, workspaceParams);
      const pathEntries = (path || '').split('/');
      const projectPathEntries = (projectPath || '').split('/');
      const name = pathEntries[pathEntries.length - 2] // path ends with `/`
        || projectPathEntries[projectPathEntries.length - 1];
      useWorkspaceStore().patchWorkspacesById({
        [workspaceId]: {
          ...workspaceParams,
          projectId,
          id: workspaceId,
          sub: token.sub,
          name,
        },
      });
    }

    (badgeSvc as any).addBadge('addGitlabWorkspace');
    return useWorkspaceStore().workspacesById[workspaceId];
  },
  getChanges(): any {
    return (gitlabHelper as any).getTree({
      ...useWorkspaceStore().currentWorkspace,
      token: (this as any).getToken(),
    });
  },
  prepareChanges(tree: any): any {
    return (gitWorkspaceSvc as any).makeChanges(tree.map((entry: any) => ({
      ...entry,
      sha: entry.id,
    })));
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
    await (gitlabHelper as any).uploadFile({
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
      await (gitlabHelper as any).removeFile({
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
    const { sha, data } = await (gitlabHelper as any).downloadFile({
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

    const { sha, data } = await (gitlabHelper as any).downloadFile({
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
    const sha = (gitWorkspaceSvc as any).shaByPath[path];
    await (gitlabHelper as any).uploadFile({
      ...useWorkspaceStore().currentWorkspace,
      token,
      path: absolutePath,
      content: Provider.serializeContent(content),
      sha,
    });

    // Return new sync data
    return {
      contentSyncData: {
        id: useGlobalStore().gitPathsByItemId[content.id],
        type: content.type,
        hash: content.hash,
        sha,
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
    const res = await (gitlabHelper as any).uploadFile({
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
    const { projectId, branch } = useWorkspaceStore().currentWorkspace as any;
    const entries = await (gitlabHelper as any).getCommits({
      token,
      projectId,
      sha: branch,
      path: getAbsolutePath({ id: fileSyncDataId }),
    });

    return entries.map((entry: any) => {
      const email = entry.author_email || entry.committer_email;
      const sub = `${(gitlabHelper as any).subPrefix}:${token.serverUrl}/${email}`;
      (userSvc as any).addUserInfo({
        id: sub,
        name: entry.author_name || entry.committer_name,
        imageUrl: '', // No way to get user's avatar url...
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
    // Revisions are already loaded
    return false;
  },
  async getFileRevisionContent({
    token,
    contentId,
    fileSyncDataId,
    revisionId,
  }: any): Promise<any> {
    const { data } = await (gitlabHelper as any).downloadFile({
      ...useWorkspaceStore().currentWorkspace,
      token,
      branch: revisionId,
      path: getAbsolutePath({ id: fileSyncDataId }),
    });
    return Provider.parseContent(data, contentId);
  },
});
