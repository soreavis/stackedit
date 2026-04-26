import { defineStore } from 'pinia';
import utils from '../services/utils';
import providerRegistry from '../services/providers/common/providerRegistry';
import { useDataStore } from './data';

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    currentWorkspaceId: null,
    lastFocus: 0,
  }),
  getters: {
    workspacesById() {
      const workspacesById = {};
      const mainWorkspaceToken = this.mainWorkspaceToken;
      Object.entries(useDataStore().workspaces).forEach(([id, workspace]) => {
        const sanitizedWorkspace = {
          id,
          providerId: 'googleDriveAppData',
          sub: mainWorkspaceToken && mainWorkspaceToken.sub,
          ...workspace,
        };
        const workspaceProvider = providerRegistry.providersById[sanitizedWorkspace.providerId];
        if (workspaceProvider) {
          const params = workspaceProvider.getWorkspaceParams(sanitizedWorkspace);
          sanitizedWorkspace.url = utils.addQueryParams('app', params, true);
          sanitizedWorkspace.locationUrl = workspaceProvider
            .getWorkspaceLocationUrl(sanitizedWorkspace);
          workspacesById[id] = sanitizedWorkspace;
        }
      });
      return workspacesById;
    },
    mainWorkspace() {
      return this.workspacesById.main;
    },
    currentWorkspace() {
      return this.workspacesById[this.currentWorkspaceId] || this.mainWorkspace;
    },
    currentWorkspaceIsGit() {
      const id = this.currentWorkspace.providerId;
      return id === 'githubWorkspace' || id === 'gitlabWorkspace';
    },
    currentWorkspaceHasUniquePaths() {
      const id = this.currentWorkspace.providerId;
      return id === 'githubWorkspace' || id === 'gitlabWorkspace';
    },
    lastSyncActivityKey() {
      return `${this.currentWorkspace.id}/lastSyncActivity`;
    },
    lastFocusKey() {
      return `${this.currentWorkspace.id}/lastWindowFocus`;
    },
    mainWorkspaceToken() {
      return utils.someResult(
        Object.values(useDataStore().googleTokensBySub),
        (token) => {
          if (token.isLogin) return token;
          return null;
        },
      );
    },
    syncToken() {
      const cw = this.currentWorkspace;
      switch (cw.providerId) {
        case 'googleDriveWorkspace':
          return useDataStore().googleTokensBySub[cw.sub];
        case 'githubWorkspace':
          return useDataStore().githubTokensBySub[cw.sub];
        case 'gitlabWorkspace':
          return useDataStore().gitlabTokensBySub[cw.sub];
        case 'couchdbWorkspace':
          return useDataStore().couchdbTokensBySub[cw.id];
        default:
          return this.mainWorkspaceToken;
      }
    },
    loginType() {
      switch (this.currentWorkspace.providerId) {
        case 'githubWorkspace': return 'github';
        case 'gitlabWorkspace': return 'gitlab';
        case 'googleDriveWorkspace':
        default: return 'google';
      }
    },
    loginToken() {
      const tokensBySub = useDataStore().tokensByType[this.loginType];
      return tokensBySub && tokensBySub[this.currentWorkspace.sub];
    },
    sponsorToken() {
      return this.mainWorkspaceToken;
    },
  },
  actions: {
    setCurrentWorkspaceIdRaw(value) {
      this.currentWorkspaceId = value;
    },
    setLastFocus(value) {
      this.lastFocus = value;
    },
    removeWorkspace(id) {
      const workspaces = { ...useDataStore().workspaces };
      delete workspaces[id];
      useDataStore().setItem({ id: 'workspaces', data: workspaces });
    },
    patchWorkspacesById(workspaces) {
      const sanitizedWorkspaces = {};
      Object
        .entries({
          ...useDataStore().workspaces,
          ...workspaces,
        })
        .forEach(([id, workspace]) => {
          sanitizedWorkspaces[id] = {
            ...workspace,
            id,
            url: undefined,
            locationUrl: undefined,
          };
        });
      useDataStore().setItem({ id: 'workspaces', data: sanitizedWorkspaces });
    },
    setCurrentWorkspaceId(value) {
      this.setCurrentWorkspaceIdRaw(value);
      const lastFocus = parseInt(localStorage.getItem(this.lastFocusKey), 10) || 0;
      this.setLastFocus(lastFocus);
    },
  },
});
