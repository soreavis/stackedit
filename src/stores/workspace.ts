import { defineStore } from 'pinia';
import utils from '../services/utils';
import providerRegistry from '../services/providers/common/providerRegistry';
import { useDataStore } from './data';

export interface Workspace {
  id?: string;
  providerId?: string;
  sub?: string;
  url?: string;
  locationUrl?: string;
  [key: string]: unknown;
}

export interface Token {
  sub: string;
  isLogin?: boolean;
  name?: string;
  [key: string]: unknown;
}

interface WorkspaceState {
  currentWorkspaceId: string | null;
  lastFocus: number;
}

export const useWorkspaceStore = defineStore('workspace', {
  state: (): WorkspaceState => ({
    currentWorkspaceId: null,
    lastFocus: 0,
  }),
  getters: {
    workspacesById(): Record<string, Workspace> {
      const workspacesById: Record<string, Workspace> = {};
      const mainWorkspaceToken = this.mainWorkspaceToken as Token | undefined;
      Object.entries((useDataStore() as any).workspaces as Record<string, Workspace>).forEach(([id, workspace]) => {
        const sanitizedWorkspace: Workspace = {
          id,
          providerId: 'googleDriveAppData',
          sub: mainWorkspaceToken && mainWorkspaceToken.sub,
          ...workspace,
        };
        const workspaceProvider = (providerRegistry as any).providersById[sanitizedWorkspace.providerId as string];
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
    mainWorkspace(): Workspace {
      return this.workspacesById.main;
    },
    currentWorkspace(): Workspace {
      return this.workspacesById[this.currentWorkspaceId as string] || this.mainWorkspace;
    },
    currentWorkspaceIsGit(): boolean {
      const id = this.currentWorkspace.providerId;
      return id === 'githubWorkspace' || id === 'gitlabWorkspace';
    },
    currentWorkspaceHasUniquePaths(): boolean {
      const id = this.currentWorkspace.providerId;
      return id === 'githubWorkspace' || id === 'gitlabWorkspace';
    },
    lastSyncActivityKey(): string {
      return `${this.currentWorkspace.id}/lastSyncActivity`;
    },
    lastFocusKey(): string {
      return `${this.currentWorkspace.id}/lastWindowFocus`;
    },
    mainWorkspaceToken(): Token | null {
      const result = utils.someResult(
        Object.values((useDataStore() as any).googleTokensBySub as Record<string, Token>),
        (token: Token) => {
          if (token.isLogin) return token;
          return null;
        },
      ) as Token | undefined;
      return result || null;
    },
    syncToken(): Token | undefined | null {
      const cw = this.currentWorkspace;
      const dataStore = useDataStore() as any;
      switch (cw.providerId) {
        case 'googleDriveWorkspace':
          return dataStore.googleTokensBySub[cw.sub as string];
        case 'githubWorkspace':
          return dataStore.githubTokensBySub[cw.sub as string];
        case 'gitlabWorkspace':
          return dataStore.gitlabTokensBySub[cw.sub as string];
        case 'couchdbWorkspace':
          return dataStore.couchdbTokensBySub[cw.id as string];
        default:
          return this.mainWorkspaceToken;
      }
    },
    loginType(): string {
      switch (this.currentWorkspace.providerId) {
        case 'githubWorkspace': return 'github';
        case 'gitlabWorkspace': return 'gitlab';
        case 'googleDriveWorkspace':
        default: return 'google';
      }
    },
    loginToken(): Token | undefined {
      const tokensBySub = (useDataStore() as any).tokensByType[this.loginType] as Record<string, Token> | undefined;
      return tokensBySub && tokensBySub[this.currentWorkspace.sub as string];
    },
    sponsorToken(): Token | null {
      return this.mainWorkspaceToken;
    },
  },
  actions: {
    setCurrentWorkspaceIdRaw(value: string | null): void {
      this.currentWorkspaceId = value;
    },
    setLastFocus(value: number): void {
      this.lastFocus = value;
    },
    removeWorkspace(id: string): void {
      const workspaces = { ...((useDataStore() as any).workspaces as Record<string, Workspace>) };
      delete workspaces[id];
      (useDataStore() as any).setItem({ id: 'workspaces', data: workspaces });
    },
    patchWorkspacesById(workspaces: Record<string, Workspace>): void {
      const sanitizedWorkspaces: Record<string, Workspace> = {};
      Object
        .entries({
          ...((useDataStore() as any).workspaces as Record<string, Workspace>),
          ...workspaces,
        })
        .forEach(([id, workspace]) => {
          sanitizedWorkspaces[id] = {
            ...(workspace as Workspace),
            id,
            url: undefined,
            locationUrl: undefined,
          };
        });
      (useDataStore() as any).setItem({ id: 'workspaces', data: sanitizedWorkspaces });
    },
    setCurrentWorkspaceId(value: string | null): void {
      this.setCurrentWorkspaceIdRaw(value);
      const lastFocus = parseInt(localStorage.getItem(this.lastFocusKey) as string, 10) || 0;
      this.setLastFocus(lastFocus);
    },
  },
});
