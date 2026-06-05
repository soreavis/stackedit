<template>
  <div class="side-bar__panel side-bar__panel--menu">
    <div class="side-bar__info">
      <div class="menu-entry menu-entry--info flex flex--row flex--align-center" v-if="loginToken">
        <div class="menu-entry__icon menu-entry__icon--image">
          <user-image :user-id="userId"></user-image>
        </div>
        <span>Signed in as <b>{{ loginToken.name }}</b>.</span>
      </div>
      <div class="menu-entry menu-entry--info flex flex--row flex--align-center" v-if="syncToken">
        <div class="menu-entry__icon menu-entry__icon--image">
          <icon-provider :provider-id="currentWorkspace.providerId"></icon-provider>
        </div>
        <span v-if="currentWorkspace.providerId === 'googleDriveAppData'">
          <b>{{ currentWorkspace.name }}</b> synced with your Google Drive app data folder.
        </span>
        <span v-else-if="currentWorkspace.providerId === 'googleDriveWorkspace'">
          <b>{{ currentWorkspace.name }}</b> synced with a <a :href="workspaceLocationUrl" target="_blank" rel="noopener noreferrer">Google Drive folder</a>.
        </span>
        <span v-else-if="currentWorkspace.providerId === 'couchdbWorkspace'">
          <b>{{ currentWorkspace.name }}</b> synced with a <a :href="workspaceLocationUrl" target="_blank" rel="noopener noreferrer">CouchDB database</a>.
        </span>
        <span v-else-if="currentWorkspace.providerId === 'githubWorkspace'">
          <b>{{ currentWorkspace.name }}</b> synced with a <a :href="workspaceLocationUrl" target="_blank" rel="noopener noreferrer">GitHub repo</a>.
        </span>
        <span v-else-if="currentWorkspace.providerId === 'gitlabWorkspace'">
          <b>{{ currentWorkspace.name }}</b> synced with a <a :href="workspaceLocationUrl" target="_blank" rel="noopener noreferrer">GitLab project</a>.
        </span>
      </div>
      <div class="menu-entry menu-entry--info flex flex--row flex--align-center" v-else>
        <div class="menu-entry__icon menu-entry__icon--disabled">
          <icon-sync-off></icon-sync-off>
        </div>
        <span><b>{{ currentWorkspace.name }}</b> not synced.</span>
      </div>
    </div>
    <menu-entry v-if="!loginToken" @click.native="signin">
      <template #icon><icon-login></icon-login></template>
      <div>Sign in with Google</div>
      <span>Sync your main workspace and unlock functionalities.</span>
    </menu-entry>
    <menu-entry @click.native="setPanel('workspaces')">
      <template #icon><icon-database></icon-database></template>
      <div><div class="menu-entry__label menu-entry__label--count" v-if="workspaceCount">{{ workspaceCount }}</div> Workspaces</div>
      <span>Switch to another workspace.</span>
    </menu-entry>
    <hr>
    <menu-entry @click.native="setPanel('sync')" :disabled="!hasCurrentFile">
      <template #icon><icon-sync></icon-sync></template>
      <div><div class="menu-entry__label menu-entry__label--count" v-if="syncLocationCount">{{ syncLocationCount }}</div> Synchronize</div>
      <span>Sync your files in the Cloud.</span>
    </menu-entry>
    <menu-entry @click.native="setPanel('publish')" :disabled="!hasCurrentFile">
      <template #icon><icon-upload></icon-upload></template>
      <div><div class="menu-entry__label menu-entry__label--count" v-if="publishLocationCount">{{ publishLocationCount }}</div>Publish</div>
      <span>Export your files to the web.</span>
    </menu-entry>
    <menu-entry @click.native="setPanel('history')" :disabled="!hasCurrentFile">
      <template #icon><icon-history></icon-history></template>
      <div>History</div>
      <span>Track and restore file revisions.</span>
    </menu-entry>
    <menu-entry @click.native="fileProperties" :disabled="!hasCurrentFile">
      <template #icon><icon-view-list></icon-view-list></template>
      <div>File properties</div>
      <span>Add metadata and configure extensions.</span>
    </menu-entry>
    <hr>
    <menu-entry @click.native="setPanel('toc')">
      <template #icon><icon-toc></icon-toc></template>
      Table of contents
    </menu-entry>
    <menu-entry @click.native="setPanel('help')">
      <template #icon><icon-help-circle></icon-help-circle></template>
      Markdown cheat sheet
    </menu-entry>
    <hr>
    <menu-entry @click.native="setPanel('importExport')">
      <template #icon><icon-content-save></icon-content-save></template>
      Import/export
    </menu-entry>
    <menu-entry @click.native="print" :disabled="!hasCurrentFile">
      <template #icon><icon-printer></icon-printer></template>
      Print
    </menu-entry>
    <hr>
    <menu-entry @click.native="badges">
      <template #icon><icon-seal></icon-seal></template>
      <div><div class="menu-entry__label menu-entry__label--count">{{ badgeCount }}/{{ featureCount }}</div> Badges</div>
      <span>List application features and earned badges.</span>
    </menu-entry>
    <menu-entry @click.native="accounts">
      <template #icon><icon-key></icon-key></template>
      <div><div class="menu-entry__label menu-entry__label--count">{{ accountCount }}</div> Accounts</div>
      <span>Manage access to your external accounts.</span>
    </menu-entry>
    <menu-entry @click.native="templates">
      <template #icon><icon-code-braces></icon-code-braces></template>
      <div><div class="menu-entry__label menu-entry__label--count">{{ templateCount }}</div> Templates</div>
      <span>Configure Handlebars templates for your exports.</span>
    </menu-entry>
    <menu-entry @click.native="settings">
      <template #icon><icon-settings></icon-settings></template>
      <div>Settings</div>
      <span>Tweak application and keyboard shortcuts.</span>
    </menu-entry>
    <hr>
    <menu-entry @click.native="setPanel('workspaceBackups')">
      <template #icon><icon-content-save></icon-content-save></template>
      Workspace backups
    </menu-entry>
    <menu-entry @click.native="reset">
      <template #icon><icon-logout></icon-logout></template>
      Reset application
    </menu-entry>
    <menu-entry @click.native="about">
      <template #icon><icon-help-circle></icon-help-circle></template>
      About StackEdit
    </menu-entry>
  </div>
</template>

<script>
import { mapState as mapPiniaState, mapActions as mapPiniaActions } from 'pinia';
import MenuEntry from './common/MenuEntry';
import providerRegistry from '../../services/providers/common/providerRegistry';
import UserImage from '../UserImage';
import googleHelper from '../../services/providers/helpers/googleHelper';
import syncSvc from '../../services/syncSvc';
import userSvc from '../../services/userSvc';
import { useSyncLocationStore } from '../../stores/syncLocation';
import { usePublishLocationStore } from '../../stores/publishLocation';
import { useWorkspaceStore } from '../../stores/workspace';
import { useFileStore } from '../../stores/file';
import { useModalStore } from '../../stores/modal';
import { useDataStore } from '../../stores/data';

export default {
  components: {
    MenuEntry,
    UserImage,
  },
  computed: {
    ...mapPiniaState(useWorkspaceStore, [
      'currentWorkspace',
      'syncToken',
      'loginToken',
    ]),
    userId() {
      return userSvc.getCurrentUserId();
    },
    workspaceLocationUrl() {
      const provider = providerRegistry.providersById[this.currentWorkspace.providerId];
      return provider.getWorkspaceLocationUrl(this.currentWorkspace);
    },
    workspaceCount() {
      return Object.keys(useWorkspaceStore().workspacesById).length;
    },
    syncLocationCount() {
      return Object.keys(useSyncLocationStore().currentWithWorkspaceSyncLocation).length;
    },
    publishLocationCount() {
      return Object.keys(usePublishLocationStore().current).length;
    },
    hasCurrentFile() {
      return !!useFileStore().current.id;
    },
    templateCount() {
      return Object.keys(useDataStore().allTemplatesById).length;
    },
    accountCount() {
      return Object.values(useDataStore().tokensByType)
        .reduce((count, tokensBySub) => count + Object.values(tokensBySub).length, 0);
    },
    badgeCount() {
      return useDataStore().allBadges.filter(badge => badge.isEarned).length;
    },
    featureCount() {
      return useDataStore().allBadges.length;
    },
  },
  methods: {
    ...mapPiniaActions(useDataStore, {
      setPanel: 'setSideBarPanel',
    }),
    async signin() {
      try {
        await googleHelper.signin();
        syncSvc.requestSync();
      } catch (e) {
        // Cancel
      }
    },
    async fileProperties() {
      try {
        await useModalStore().open('fileProperties');
      } catch (e) {
        // Cancel
      }
    },
    print() {
      window.print();
    },
    async settings() {
      try {
        await useModalStore().open('settings');
      } catch (e) { /* Cancel */ }
    },
    async templates() {
      try {
        await useModalStore().open('templates');
      } catch (e) { /* Cancel */ }
    },
    async accounts() {
      try {
        await useModalStore().open('accountManagement');
      } catch (e) { /* Cancel */ }
    },
    async badges() {
      try {
        await useModalStore().open('badgeManagement');
      } catch (e) { /* Cancel */ }
    },
    async reset() {
      try {
        await useModalStore().open('reset');
        localStorage.setItem('resetStackEdit', '1');
        window.location.reload();
      } catch (e) { /* Cancel */ }
    },
    about() {
      // Swallow the reject() the modal fires on cancel/close — same as every
      // other opener in this file. Without it, dismissing About surfaces an
      // "Uncaught (in promise) undefined".
      useModalStore().open('about').catch(() => {});
    },
  },
};
</script>
