<template>
  <div class="side-bar__panel side-bar__panel--menu">
    <div class="side-bar__info" v-if="isCurrentTemp">
      <p>{{ currentFileName }} can't be synced as it's a temporary file.</p>
    </div>
    <div v-else>
      <div class="side-bar__info" v-if="syncLocations.length">
        <p>{{ currentFileName }} is already synchronized.</p>
        <menu-entry @click.native="requestSync">
          <template #icon><icon-sync></icon-sync></template>
          <div>Synchronize now</div>
          <span>Download / upload file changes.</span>
        </menu-entry>
        <menu-entry @click.native="manageSync">
          <template #icon><icon-view-list></icon-view-list></template>
          <div><div class="menu-entry__label menu-entry__label--count">{{ locationCount }}</div> File synchronization</div>
          <span>Manage synchronized locations for {{ currentFileName }}.</span>
        </menu-entry>
      </div>
      <div class="side-bar__info" v-else-if="noToken">
        <p>You have to link an account to start syncing files.</p>
      </div>
      <hr>
      <div v-for="token in dropboxTokens" :key="token.sub">
        <menu-entry @click.native="openDropbox(token)">
          <template #icon><icon-provider provider-id="dropbox"></icon-provider></template>
          <div>Open from Dropbox</div>
          <span>{{ token.name }}</span>
        </menu-entry>
        <menu-entry @click.native="saveDropbox(token)">
          <template #icon><icon-provider provider-id="dropbox"></icon-provider></template>
          <div>Save on Dropbox</div>
          <span>{{ token.name }}</span>
        </menu-entry>
      </div>
      <div v-for="token in githubTokens" :key="token.sub">
        <menu-entry @click.native="openGithub(token)">
          <template #icon><icon-provider provider-id="github"></icon-provider></template>
          <div>Open from GitHub</div>
          <span>{{ token.name }}</span>
        </menu-entry>
        <menu-entry @click.native="saveGithub(token)">
          <template #icon><icon-provider provider-id="github"></icon-provider></template>
          <div>Save on GitHub</div>
          <span>{{ token.name }}</span>
        </menu-entry>
        <menu-entry @click.native="saveGist(token)">
          <template #icon><icon-provider provider-id="gist"></icon-provider></template>
          <div>Save on Gist</div>
          <span>{{ token.name }}</span>
        </menu-entry>
      </div>
      <div v-for="token in gitlabTokens" :key="token.sub">
        <menu-entry @click.native="openGitlab(token)">
          <template #icon><icon-provider provider-id="gitlab"></icon-provider></template>
          <div>Open from GitLab</div>
          <span>{{ token.name }}</span>
        </menu-entry>
        <menu-entry @click.native="saveGitlab(token)">
          <template #icon><icon-provider provider-id="gitlab"></icon-provider></template>
          <div>Save on GitLab</div>
          <span>{{ token.name }}</span>
        </menu-entry>
      </div>
      <div v-for="token in googleDriveTokens" :key="token.sub">
        <menu-entry @click.native="openGoogleDrive(token)">
          <template #icon><icon-provider provider-id="googleDrive"></icon-provider></template>
          <div>Open from Google Drive</div>
          <span>{{ token.name }}</span>
        </menu-entry>
        <menu-entry @click.native="saveGoogleDrive(token)">
          <template #icon><icon-provider provider-id="googleDrive"></icon-provider></template>
          <div>Save on Google Drive</div>
          <span>{{ token.name }}</span>
        </menu-entry>
      </div>
      <hr>
      <menu-entry @click.native="addDropboxAccount">
        <template #icon><icon-provider provider-id="dropbox"></icon-provider></template>
        <span>Add Dropbox account</span>
      </menu-entry>
      <menu-entry @click.native="addGithubAccount">
        <template #icon><icon-provider provider-id="github"></icon-provider></template>
        <span>Add GitHub account</span>
      </menu-entry>
      <menu-entry @click.native="addGitlabAccount">
        <template #icon><icon-provider provider-id="gitlab"></icon-provider></template>
        <span>Add GitLab account</span>
      </menu-entry>
      <menu-entry @click.native="addGoogleDriveAccount">
        <template #icon><icon-provider provider-id="googleDrive"></icon-provider></template>
        <span>Add Google Drive account</span>
      </menu-entry>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapState as mapPiniaState } from 'pinia';
import MenuEntry from './common/MenuEntry.vue';
import googleHelper from '../../services/providers/helpers/googleHelper';
import dropboxHelper from '../../services/providers/helpers/dropboxHelper';
import githubHelper from '../../services/providers/helpers/githubHelper';
import gitlabHelper from '../../services/providers/helpers/gitlabHelper';
import googleDriveProvider from '../../services/providers/googleDriveProvider';
import dropboxProvider from '../../services/providers/dropboxProvider';
import githubProvider from '../../services/providers/githubProvider';
import gitlabProvider from '../../services/providers/gitlabProvider';
import syncSvc from '../../services/syncSvc';
import { useSyncLocationStore } from '../../stores/syncLocation';
import { useWorkspaceStore } from '../../stores/workspace';
import { useFileStore } from '../../stores/file';
import { useModalStore } from '../../stores/modal';
import badgeSvc from '../../services/badgeSvc';
import { useQueueStore } from '../../stores/queue';
import { useDataStore } from '../../stores/data';

const tokensToArray = (tokens: any, filter: (token: any) => boolean = () => true): any[] => Object.values(tokens)
  .filter((token: any) => filter(token))
  .sort((token1: any, token2: any) => token1.name.localeCompare(token2.name));

const openSyncModal = (token: any, type: string) => useModalStore().open({
  type,
  token,
}).then((syncLocation: any) => syncSvc.createSyncLocation(syncLocation));

export default defineComponent({
  components: {
    MenuEntry,
  },
  computed: {
    ...mapPiniaState(useQueueStore, [
      'isSyncRequested',
    ]),
    ...mapPiniaState(useWorkspaceStore, [
      'syncToken',
    ]),
    ...mapPiniaState(useFileStore, [
      'isCurrentTemp',
    ]),
    // currentWithWorkspaceSyncLocation is typed `unknown[]` by the loose
    // location store; the template/consumers only use .length, so surface
    // it as an array here rather than via a mapPiniaState rename (whose
    // renamed-getter overload vue-tsc can't infer a real type for).
    syncLocations(): unknown[] {
      return (useSyncLocationStore() as any).currentWithWorkspaceSyncLocation as unknown[];
    },
    locationCount() {
      return Object.keys(this.syncLocations).length;
    },
    currentFileName() {
      return `"${useFileStore().current.name}"`;
    },
    dropboxTokens() {
      return tokensToArray(useDataStore().dropboxTokensBySub);
    },
    githubTokens() {
      return tokensToArray(useDataStore().githubTokensBySub);
    },
    gitlabTokens() {
      return tokensToArray(useDataStore().gitlabTokensBySub);
    },
    googleDriveTokens() {
      return tokensToArray(useDataStore().googleTokensBySub, (token: any) => token.isDrive);
    },
    noToken() {
      return !this.googleDriveTokens.length
        && !this.dropboxTokens.length
        && !this.githubTokens.length;
    },
  },
  methods: {
    requestSync() {
      if (!this.isSyncRequested) {
        syncSvc.requestSync(true);
      }
    },
    async manageSync() {
      try {
        await useModalStore().open('syncManagement');
      } catch (e) { /* cancel */ }
    },
    async addDropboxAccount() {
      try {
        await useModalStore().open({ type: 'dropboxAccount' });
        await dropboxHelper.addAccount(!useDataStore().localSettings.dropboxRestrictedAccess);
      } catch (e) { /* cancel */ }
    },
    async addGithubAccount() {
      try {
        await useModalStore().open({ type: 'githubAccount' });
        await githubHelper.addAccount(useDataStore().localSettings.githubRepoFullAccess);
      } catch (e) { /* cancel */ }
    },
    async addGitlabAccount() {
      try {
        const { serverUrl, applicationId } = await useModalStore().open({ type: 'gitlabAccount' }) as { serverUrl: string; applicationId: string };
        await gitlabHelper.addAccount(serverUrl, applicationId);
      } catch (e) { /* cancel */ }
    },
    async addGoogleDriveAccount() {
      try {
        await useModalStore().open({ type: 'googleDriveAccount' });
        await googleHelper.addDriveAccount(!useDataStore().localSettings.googleDriveRestrictedAccess);
      } catch (e) { /* cancel */ }
    },
    async openDropbox(token: any) {
      const paths = await dropboxHelper.openChooser(token);
      useQueueStore().enqueue(
        async () => {
          await (dropboxProvider as any).openFiles(token, paths);
          badgeSvc.addBadge('openFromDropbox');
        },
      );
    },
    async saveDropbox(token: any) {
      try {
        await openSyncModal(token, 'dropboxSave');
        badgeSvc.addBadge('saveOnDropbox');
      } catch (e) { /* cancel */ }
    },
    async openGoogleDrive(token: any) {
      const files = await googleHelper.openPicker(token, 'doc');
      useQueueStore().enqueue(
        async () => {
          await (googleDriveProvider as any).openFiles(token, files);
          badgeSvc.addBadge('openFromGoogleDrive');
        },
      );
    },
    async saveGoogleDrive(token: any) {
      try {
        await openSyncModal(token, 'googleDriveSave');
        badgeSvc.addBadge('saveOnGoogleDrive');
      } catch (e) { /* cancel */ }
    },
    async openGithub(token: any) {
      try {
        const syncLocation = await useModalStore().open({
          type: 'githubOpen',
          token,
        });
        useQueueStore().enqueue(
          async () => {
            await (githubProvider as any).openFile(token, syncLocation);
            badgeSvc.addBadge('openFromGithub');
          },
        );
      } catch (e) { /* cancel */ }
    },
    async saveGithub(token: any) {
      try {
        await openSyncModal(token, 'githubSave');
        badgeSvc.addBadge('saveOnGithub');
      } catch (e) { /* cancel */ }
    },
    async saveGist(token: any) {
      try {
        await openSyncModal(token, 'gistSync');
        badgeSvc.addBadge('saveOnGist');
      } catch (e) { /* cancel */ }
    },
    async openGitlab(token: any) {
      try {
        const syncLocation = await useModalStore().open({
          type: 'gitlabOpen',
          token,
        });
        useQueueStore().enqueue(
          async () => {
            await (gitlabProvider as any).openFile(token, syncLocation);
            badgeSvc.addBadge('openFromGitlab');
          },
        );
      } catch (e) { /* cancel */ }
    },
    async saveGitlab(token: any) {
      try {
        await openSyncModal(token, 'gitlabSave');
        badgeSvc.addBadge('saveOnGitlab');
      } catch (e) { /* cancel */ }
    },
  },
});
</script>
