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
import vuexStore from '../store';
import { useLayoutStore } from './layout';
import { useDiscussionStore } from './discussion';

const itemTemplate = (id, data = {}) => ({
  id,
  type: 'data',
  data,
  hash: 0,
});

const empty = (id) => {
  switch (id) {
    case 'workspaces': return itemTemplate(id, defaultWorkspaces());
    case 'settings': return itemTemplate(id, '\n');
    case 'localSettings': return itemTemplate(id, defaultLocalSettings());
    case 'layoutSettings': return itemTemplate(id, defaultLayoutSettings());
    default: return itemTemplate(id);
  }
};

const localStorageIdSet = new Set(constants.localStorageDataIds);

const notEnoughSpace = (layoutConstants, showGutter) =>
  document.body.clientWidth < layoutConstants.editorMinWidth +
    layoutConstants.explorerWidth +
    layoutConstants.sideBarWidth +
    layoutConstants.buttonBarWidth +
    (showGutter ? layoutConstants.gutterWidth : 0);

const makeAdditionalTemplate = (name, value, helpers = '\n', description = '') => ({
  name,
  description,
  value,
  helpers,
  isAdditional: true,
});
const defaultTemplates = {
  plainText: makeAdditionalTemplate('Plain text', '{{{files.0.content.text}}}', '\n', 'Raw markdown source'),
  plainHtml: makeAdditionalTemplate('Plain HTML', plainHtmlTemplate, '\n', 'HTML body fragment, no styles'),
  styledHtml: makeAdditionalTemplate('Styled HTML', styledHtmlTemplate, '\n', 'Full document with default styles'),
  styledHtmlWithToc: makeAdditionalTemplate('Styled HTML with TOC', styledHtmlWithTocTemplate, '\n', 'Full document with TOC sidebar'),
  jekyllSite: makeAdditionalTemplate('Jekyll site', jekyllSiteTemplate, '\n', 'YAML front-matter + body'),
};

// Per-id getter helper. Picks lsItemsById vs itemsById based on
// localStorage routing. State is the store state.
function getById(state, id) {
  const itemsById = localStorageIdSet.has(id) ? state.lsItemsById : state.itemsById;
  if (itemsById[id]) return itemsById[id].data;
  return empty(id).data;
}

export const useDataStore = defineStore('data', {
  state: () => ({
    itemsById: {},
    lsItemsById: {},
  }),
  getters: {
    serverConf(state) { return getById(state, 'serverConf'); },
    workspaces(state) { return getById(state, 'workspaces'); },
    settings(state) { return getById(state, 'settings'); },
    computedSettings() {
      const customSettings = yaml.load(this.settings);
      const parsedSettings = yaml.load(defaultSettings);
      const override = (obj, opt) => {
        const objType = Object.prototype.toString.call(obj);
        const optType = Object.prototype.toString.call(opt);
        if (objType !== optType) return obj;
        if (objType !== '[object Object]') return opt;
        Object.keys(obj).forEach((key) => {
          if (key === 'shortcuts') {
            obj[key] = Object.assign(obj[key], opt[key]);
          } else {
            obj[key] = override(obj[key], opt[key]);
          }
        });
        return obj;
      };
      return override(parsedSettings, customSettings);
    },
    localSettings(state) { return getById(state, 'localSettings'); },
    layoutSettings(state) { return getById(state, 'layoutSettings'); },
    templatesById(state) { return getById(state, 'templates'); },
    allTemplatesById() {
      return { ...this.templatesById, ...defaultTemplates };
    },
    lastCreated(state) { return getById(state, 'lastCreated'); },
    lastOpened(state) { return getById(state, 'lastOpened'); },
    lastOpenedIds() {
      const result = { ...this.lastOpened };
      const currentFileId = useFileStore().currentId;
      if (currentFileId && !result[currentFileId]) {
        result[currentFileId] = Date.now();
      }
      return Object.keys(result)
        .filter(id => useFileStore().itemsById[id])
        .sort((id1, id2) => result[id2] - result[id1])
        .slice(0, 20);
    },
    syncDataById(state) { return getById(state, 'syncData'); },
    syncDataByItemId() {
      const result = {};
      const isGit = useWorkspaceStore().currentWorkspaceIsGit;
      if (isGit) {
        Object.entries(vuexStore.getters.gitPathsByItemId).forEach(([id, path]) => {
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
    dataSyncDataById(state) { return getById(state, 'dataSyncData'); },
    tokensByType(state) { return getById(state, 'tokens'); },
    googleTokensBySub() { return this.tokensByType.google || {}; },
    couchdbTokensBySub() { return this.tokensByType.couchdb || {}; },
    dropboxTokensBySub() { return this.tokensByType.dropbox || {}; },
    githubTokensBySub() { return this.tokensByType.github || {}; },
    gitlabTokensBySub() { return this.tokensByType.gitlab || {}; },
    wordpressTokensBySub() { return this.tokensByType.wordpress || {}; },
    zendeskTokensBySub() { return this.tokensByType.zendesk || {}; },
    badgeCreations(state) { return getById(state, 'badgeCreations'); },
    badgeTree() {
      return features.map(feature => feature.toBadge(this.badgeCreations));
    },
    allBadges() {
      const result = [];
      const processBadgeNodes = nodes => nodes.forEach((node) => {
        result.push(node);
        if (node.children) processBadgeNodes(node.children);
      });
      processBadgeNodes(this.badgeTree);
      return result;
    },
  },
  actions: {
    setItem(value) {
      const emptyItem = empty(value.id);
      const data = typeof value.data === 'object'
        ? Object.assign(emptyItem.data, value.data)
        : value.data;
      const item = utils.addItemHash({ ...emptyItem, data });
      const target = localStorageIdSet.has(item.id) ? 'lsItemsById' : 'itemsById';
      this[target] = { ...this[target], [item.id]: item };
    },
    deleteItem(id) {
      const next = { ...this.itemsById };
      delete next[id];
      this.itemsById = next;
    },
    // factory-style actions
    setServerConf(data) { this.setItem(itemTemplate('serverConf', data)); },
    setSettings(data) { this.setItem(itemTemplate('settings', data)); },
    patchLocalSettings(data) { this.patchById('localSettings', data); },
    patchLayoutSettings(data) { this.patchById('layoutSettings', data); },
    setLastCreated(data) { this.setItem(itemTemplate('lastCreated', data)); },
    setSyncDataById(data) { this.setItem(itemTemplate('syncData', data)); },
    patchSyncDataById(data) { this.patchById('syncData', data); },
    patchDataSyncDataById(data) { this.patchById('dataSyncData', data); },
    patchTokensByType(data) { this.patchById('tokens', data); },
    patchBadgeCreations(data) { this.patchById('badgeCreations', data); },
    patchById(id, data) {
      const itemsById = localStorageIdSet.has(id) ? this.lsItemsById : this.itemsById;
      const existing = Object.assign(empty(id), itemsById[id]);
      this.setItem({
        ...empty(id),
        data: typeof data === 'object'
          ? { ...existing.data, ...data }
          : data,
      });
    },
    toggleLayoutSetting(name, value, featureId) {
      const currentValue = this.layoutSettings[name];
      const next = value === undefined ? !currentValue : !!value;
      if (next !== currentValue) {
        this.patchLayoutSettings({ [name]: next });
        badgeSvc.addBadge(featureId);
      }
    },
    toggleNavigationBar(value) { this.toggleLayoutSetting('showNavigationBar', value, 'toggleNavigationBar'); },
    toggleEditor(value) { this.toggleLayoutSetting('showEditor', value, 'toggleEditor'); },
    toggleSidePreview(value) { this.toggleLayoutSetting('showSidePreview', value, 'toggleSidePreview'); },
    toggleStatusBar(value) { this.toggleLayoutSetting('showStatusBar', value, 'toggleStatusBar'); },
    toggleScrollSync(value) { this.toggleLayoutSetting('scrollSync', value, 'toggleScrollSync'); },
    toggleFocusMode(value) { this.toggleLayoutSetting('focusMode', value, 'toggleFocusMode'); },
    toggleLineNumbers(value) { this.toggleLayoutSetting('showLineNumbers', value, 'toggleLineNumbers'); },
    toggleSideBar(value) {
      this.setSideBarPanel();
      this.toggleLayoutSetting('showSideBar', value, 'toggleSideBar');
      if (this.layoutSettings.showSideBar
        && notEnoughSpace(useLayoutStore().constants,
          useDiscussionStore().currentDiscussion)) {
        this.patchLayoutSettings({ showExplorer: false });
      }
    },
    toggleExplorer(value) {
      this.toggleLayoutSetting('showExplorer', value, 'toggleExplorer');
      if (this.layoutSettings.showExplorer
        && notEnoughSpace(useLayoutStore().constants,
          useDiscussionStore().currentDiscussion)) {
        this.patchLayoutSettings({ showSideBar: false });
      }
    },
    setSideBarPanel(value) {
      this.patchLayoutSettings({ sideBarPanel: value === undefined ? 'menu' : value });
    },
    setTemplatesById(templatesById) {
      const templatesToCommit = { ...templatesById };
      Object.keys(defaultTemplates).forEach((id) => {
        delete templatesToCommit[id];
      });
      this.setItem(itemTemplate('templates', templatesToCommit));
    },
    setLastOpenedId(fileId) {
      const lastOpened = { ...this.lastOpened };
      lastOpened[fileId] = Date.now();
      const cleaned = {};
      Object.entries(lastOpened).forEach(([id, value]) => {
        if (useFileStore().itemsById[id]) cleaned[id] = value;
      });
      this.setItem(itemTemplate('lastOpened', cleaned));
    },
    addToken(providerId, token) {
      this.patchTokensByType({
        [providerId]: {
          ...this[`${providerId}TokensBySub`],
          [token.sub]: token,
        },
      });
    },
    addGoogleToken(token) { this.addToken('google', token); },
    addCouchdbToken(token) { this.addToken('couchdb', token); },
    addDropboxToken(token) { this.addToken('dropbox', token); },
    addGithubToken(token) { this.addToken('github', token); },
    addGitlabToken(token) { this.addToken('gitlab', token); },
    addWordpressToken(token) { this.addToken('wordpress', token); },
    addZendeskToken(token) { this.addToken('zendesk', token); },
  },
});
