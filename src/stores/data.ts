import { defineStore } from 'pinia';
import yaml from 'js-yaml';
import utils from '../services/utils';
import { useFileStore } from './file';
import { useWorkspaceStore } from './workspace';
import defaultWorkspaces from '../data/defaults/defaultWorkspaces';
import defaultSettings from '../data/defaults/defaultSettings.yml?raw';
import defaultLocalSettings from '../data/defaults/defaultLocalSettings';
import defaultLayoutSettings from '../data/defaults/defaultLayoutSettings';
import plainHtmlTemplate from '../data/templates/plainHtmlTemplate.html?raw';
import styledHtmlTemplate from '../data/templates/styledHtmlTemplate.html?raw';
import styledHtmlWithTocTemplate from '../data/templates/styledHtmlWithTocTemplate.html?raw';
import jekyllSiteTemplate from '../data/templates/jekyllSiteTemplate.html?raw';
import constants from '../data/constants';
import features from '../data/features';
import badgeSvc from '../services/badgeSvc';
import { useLayoutStore } from './layout';
import { useDiscussionStore } from './discussion';
import { useGlobalStore } from './global';

export interface DataItem {
  id: string;
  type: 'data';
  data: unknown;
  hash: number;
}

interface DataState {
  itemsById: Record<string, DataItem>;
  lsItemsById: Record<string, DataItem>;
}

const itemTemplate = (id: string, data: unknown = {}): DataItem => ({
  id,
  type: 'data',
  data,
  hash: 0,
});

const empty = (id: string): DataItem => {
  switch (id) {
    case 'workspaces': return itemTemplate(id, defaultWorkspaces());
    case 'settings': return itemTemplate(id, '\n');
    case 'localSettings': return itemTemplate(id, defaultLocalSettings());
    case 'layoutSettings': return itemTemplate(id, defaultLayoutSettings());
    default: return itemTemplate(id);
  }
};

const localStorageIdSet = new Set<string>(constants.localStorageDataIds);

interface LayoutConstants {
  editorMinWidth: number;
  explorerWidth: number;
  sideBarWidth: number;
  buttonBarWidth: number;
  gutterWidth: number;
}

const notEnoughSpace = (layoutConstants: LayoutConstants, showGutter: unknown): boolean =>
  document.body.clientWidth < layoutConstants.editorMinWidth +
    layoutConstants.explorerWidth +
    layoutConstants.sideBarWidth +
    layoutConstants.buttonBarWidth +
    (showGutter ? layoutConstants.gutterWidth : 0);

interface AdditionalTemplate {
  name: string;
  description: string;
  value: string;
  helpers: string;
  isAdditional: true;
}

const makeAdditionalTemplate = (name: string, value: string, helpers = '\n', description = ''): AdditionalTemplate => ({
  name,
  description,
  value,
  helpers,
  isAdditional: true,
});

const defaultTemplates: Record<string, AdditionalTemplate> = {
  plainText: makeAdditionalTemplate('Plain text', '{{{files.0.content.text}}}', '\n', 'Raw markdown source'),
  plainHtml: makeAdditionalTemplate('Plain HTML', plainHtmlTemplate, '\n', 'HTML body fragment, no styles'),
  styledHtml: makeAdditionalTemplate('Styled HTML', styledHtmlTemplate, '\n', 'Full document with default styles'),
  styledHtmlWithToc: makeAdditionalTemplate('Styled HTML with TOC', styledHtmlWithTocTemplate, '\n', 'Full document with TOC sidebar'),
  jekyllSite: makeAdditionalTemplate('Jekyll site', jekyllSiteTemplate, '\n', 'YAML front-matter + body'),
};

// Per-id getter helper. Picks lsItemsById vs itemsById based on
// localStorage routing. State is the store state.
function getById(state: DataState, id: string): unknown {
  const itemsById = localStorageIdSet.has(id) ? state.lsItemsById : state.itemsById;
  if (itemsById[id]) return itemsById[id].data;
  return empty(id).data;
}

interface Token {
  sub: string;
  isLogin?: boolean;
  name?: string;
  [key: string]: unknown;
}

export const useDataStore = defineStore('data', {
  state: (): DataState => ({
    itemsById: {},
    lsItemsById: {},
  }),
  getters: {
    serverConf(state) { return getById(state, 'serverConf') as Record<string, unknown>; },
    workspaces(state) { return getById(state, 'workspaces') as Record<string, Record<string, unknown>>; },
    settings(state) { return getById(state, 'settings') as string; },
    computedSettings(): Record<string, unknown> {
      const customSettings = yaml.load(this.settings as string) as Record<string, unknown> | undefined;
      const parsedSettings = yaml.load(defaultSettings) as Record<string, unknown>;
      const override = (obj: unknown, opt: unknown): unknown => {
        const objType = Object.prototype.toString.call(obj);
        const optType = Object.prototype.toString.call(opt);
        if (objType !== optType) return obj;
        if (objType !== '[object Object]') return opt;
        const o = obj as Record<string, unknown>;
        const p = opt as Record<string, unknown>;
        Object.keys(o).forEach((key) => {
          if (key === 'shortcuts') {
            o[key] = Object.assign(o[key] as object, p[key]);
          } else {
            o[key] = override(o[key], p[key]);
          }
        });
        return o;
      };
      return override(parsedSettings, customSettings) as Record<string, unknown>;
    },
    localSettings(state) { return getById(state, 'localSettings') as Record<string, unknown>; },
    layoutSettings(state) { return getById(state, 'layoutSettings') as Record<string, unknown>; },
    templatesById(state) { return getById(state, 'templates') as Record<string, AdditionalTemplate>; },
    allTemplatesById(): Record<string, AdditionalTemplate> {
      return { ...this.templatesById, ...defaultTemplates };
    },
    lastCreated(state) { return getById(state, 'lastCreated') as Record<string, { created: number }>; },
    lastOpened(state) { return getById(state, 'lastOpened') as Record<string, number>; },
    lastOpenedIds(): string[] {
      const result: Record<string, number> = { ...this.lastOpened };
      const currentFileId = useFileStore().currentId;
      if (currentFileId && !result[currentFileId]) {
        result[currentFileId] = Date.now();
      }
      return Object.keys(result)
        .filter(id => useFileStore().itemsById[id])
        .sort((id1, id2) => result[id2] - result[id1])
        .slice(0, 20);
    },
    syncDataById(state) { return getById(state, 'syncData') as Record<string, { itemId: string; [k: string]: unknown }>; },
    syncDataByItemId(): Record<string, { itemId: string; [k: string]: unknown }> {
      const result: Record<string, { itemId: string; [k: string]: unknown }> = {};
      const isGit = (useWorkspaceStore() as any).currentWorkspaceIsGit as boolean;
      if (isGit) {
        Object.entries((useGlobalStore() as any).gitPathsByItemId as Record<string, string>).forEach(([id, path]) => {
          const entry = this.syncDataById[path];
          if (entry) result[id] = entry;
        });
      } else {
        Object.entries(this.syncDataById).forEach(([, entry]) => {
          result[entry.itemId] = entry;
        });
      }
      return result;
    },
    dataSyncDataById(state) { return getById(state, 'dataSyncData') as Record<string, unknown>; },
    tokensByType(state) { return getById(state, 'tokens') as Record<string, Record<string, Token>>; },
    googleTokensBySub(): Record<string, Token> { return this.tokensByType.google || {}; },
    couchdbTokensBySub(): Record<string, Token> { return this.tokensByType.couchdb || {}; },
    dropboxTokensBySub(): Record<string, Token> { return this.tokensByType.dropbox || {}; },
    githubTokensBySub(): Record<string, Token> { return this.tokensByType.github || {}; },
    gitlabTokensBySub(): Record<string, Token> { return this.tokensByType.gitlab || {}; },
    wordpressTokensBySub(): Record<string, Token> { return this.tokensByType.wordpress || {}; },
    zendeskTokensBySub(): Record<string, Token> { return this.tokensByType.zendesk || {}; },
    badgeCreations(state) { return getById(state, 'badgeCreations') as Record<string, unknown>; },
    badgeTree(): unknown[] {
      return (features as Array<{ toBadge: (creations: unknown) => unknown }>)
        .map(feature => feature.toBadge(this.badgeCreations));
    },
    allBadges(): unknown[] {
      const result: unknown[] = [];
      const processBadgeNodes = (nodes: Array<{ children?: unknown[] } & Record<string, unknown>>): void => nodes.forEach((node) => {
        result.push(node);
        if (node.children) processBadgeNodes(node.children as Array<{ children?: unknown[] } & Record<string, unknown>>);
      });
      processBadgeNodes(this.badgeTree as Array<{ children?: unknown[] } & Record<string, unknown>>);
      return result;
    },
  },
  actions: {
    setItem(value: { id: string; data: unknown }): void {
      const emptyItem = empty(value.id);
      const data = typeof value.data === 'object' && value.data !== null
        ? Object.assign(emptyItem.data as object, value.data)
        : value.data;
      const item = (utils as any).addItemHash({ ...emptyItem, data }) as DataItem;
      const target = localStorageIdSet.has(item.id) ? 'lsItemsById' : 'itemsById';
      this[target] = { ...this[target], [item.id]: item };
    },
    deleteItem(id: string): void {
      const next = { ...this.itemsById };
      delete next[id];
      this.itemsById = next;
    },
    // factory-style actions
    setServerConf(data: unknown): void { this.setItem(itemTemplate('serverConf', data)); },
    setSettings(data: unknown): void { this.setItem(itemTemplate('settings', data)); },
    patchLocalSettings(data: unknown): void { this.patchById('localSettings', data); },
    patchLayoutSettings(data: unknown): void { this.patchById('layoutSettings', data); },
    setLastCreated(data: unknown): void { this.setItem(itemTemplate('lastCreated', data)); },
    setSyncDataById(data: unknown): void { this.setItem(itemTemplate('syncData', data)); },
    patchSyncDataById(data: unknown): void { this.patchById('syncData', data); },
    patchDataSyncDataById(data: unknown): void { this.patchById('dataSyncData', data); },
    patchTokensByType(data: unknown): void { this.patchById('tokens', data); },
    patchBadgeCreations(data: unknown): void { this.patchById('badgeCreations', data); },
    patchById(id: string, data: unknown): void {
      const itemsById = localStorageIdSet.has(id) ? this.lsItemsById : this.itemsById;
      const existing = Object.assign(empty(id), itemsById[id]) as DataItem;
      this.setItem({
        ...empty(id),
        data: typeof data === 'object' && data !== null
          ? { ...(existing.data as object), ...data }
          : data,
      });
    },
    toggleLayoutSetting(name: string, value: unknown, featureId: string): void {
      const currentValue = (this.layoutSettings as Record<string, unknown>)[name];
      const next = value === undefined ? !currentValue : !!value;
      if (next !== currentValue) {
        this.patchLayoutSettings({ [name]: next });
        (badgeSvc as any).addBadge(featureId);
      }
    },
    toggleNavigationBar(value: unknown): void { this.toggleLayoutSetting('showNavigationBar', value, 'toggleNavigationBar'); },
    toggleEditor(value: unknown): void { this.toggleLayoutSetting('showEditor', value, 'toggleEditor'); },
    toggleSidePreview(value: unknown): void { this.toggleLayoutSetting('showSidePreview', value, 'toggleSidePreview'); },
    toggleStatusBar(value: unknown): void { this.toggleLayoutSetting('showStatusBar', value, 'toggleStatusBar'); },
    toggleScrollSync(value: unknown): void { this.toggleLayoutSetting('scrollSync', value, 'toggleScrollSync'); },
    toggleFocusMode(value: unknown): void { this.toggleLayoutSetting('focusMode', value, 'toggleFocusMode'); },
    toggleLineNumbers(value: unknown): void { this.toggleLayoutSetting('showLineNumbers', value, 'toggleLineNumbers'); },
    toggleSideBar(value: unknown): void {
      this.setSideBarPanel();
      this.toggleLayoutSetting('showSideBar', value, 'toggleSideBar');
      if (this.layoutSettings.showSideBar
        && notEnoughSpace((useLayoutStore() as any).constants as LayoutConstants,
          (useDiscussionStore() as any).currentDiscussion)) {
        this.patchLayoutSettings({ showExplorer: false });
      }
    },
    toggleExplorer(value: unknown): void {
      this.toggleLayoutSetting('showExplorer', value, 'toggleExplorer');
      if (this.layoutSettings.showExplorer
        && notEnoughSpace((useLayoutStore() as any).constants as LayoutConstants,
          (useDiscussionStore() as any).currentDiscussion)) {
        this.patchLayoutSettings({ showSideBar: false });
      }
    },
    setSideBarPanel(value?: unknown): void {
      this.patchLayoutSettings({ sideBarPanel: value === undefined ? 'menu' : value });
    },
    setTemplatesById(templatesById: Record<string, unknown>): void {
      const templatesToCommit = { ...templatesById };
      Object.keys(defaultTemplates).forEach((id) => {
        delete templatesToCommit[id];
      });
      this.setItem(itemTemplate('templates', templatesToCommit));
    },
    setLastOpenedId(fileId: string): void {
      const lastOpened: Record<string, number> = { ...this.lastOpened };
      lastOpened[fileId] = Date.now();
      const cleaned: Record<string, number> = {};
      Object.entries(lastOpened).forEach(([id, value]) => {
        if (useFileStore().itemsById[id]) cleaned[id] = value as number;
      });
      this.setItem(itemTemplate('lastOpened', cleaned));
    },
    addToken(providerId: string, token: Token): void {
      const tokensSubKey = `${providerId}TokensBySub` as keyof typeof this;
      const existing = (this[tokensSubKey] || {}) as Record<string, Token>;
      this.patchTokensByType({
        [providerId]: {
          ...existing,
          [token.sub]: token,
        },
      });
    },
    addGoogleToken(token: Token): void { this.addToken('google', token); },
    addCouchdbToken(token: Token): void { this.addToken('couchdb', token); },
    addDropboxToken(token: Token): void { this.addToken('dropbox', token); },
    addGithubToken(token: Token): void { this.addToken('github', token); },
    addGitlabToken(token: Token): void { this.addToken('gitlab', token); },
    addWordpressToken(token: Token): void { this.addToken('wordpress', token); },
    addZendeskToken(token: Token): void { this.addToken('zendesk', token); },
  },
});
