<template>
  <div class="side-bar__panel side-bar__panel--menu">
    <div class="side-bar__info" v-if="isCurrentTemp">
      <p>{{ currentFileName }} can't be published as it's a temporary file.</p>
    </div>
    <div v-else>
      <div class="side-bar__info" v-if="publishLocations.length">
        <p>{{ currentFileName }} is already published.</p>
        <menu-entry @click.native="requestPublish">
          <template #icon><icon-upload></icon-upload></template>
          <div>Publish now</div>
          <span>Update publications for {{ currentFileName }}.</span>
        </menu-entry>
        <menu-entry @click.native="managePublish">
          <template #icon><icon-view-list></icon-view-list></template>
          <div><div class="menu-entry__label menu-entry__label--count">{{ locationCount }}</div> File publication</div>
          <span>Manage publication locations for {{ currentFileName }}.</span>
        </menu-entry>
      </div>
      <div class="side-bar__info" v-else-if="noToken">
        <p>You have to link an account to start publishing files.</p>
      </div>
      <hr>
      <div v-for="token in bloggerTokens" :key="'blogger-' + token.sub">
        <menu-entry @click.native="publishBlogger(token)">
          <template #icon><icon-provider provider-id="blogger"></icon-provider></template>
          <div>Publish to Blogger</div>
          <span>{{ token.name }}</span>
        </menu-entry>
        <menu-entry @click.native="publishBloggerPage(token)">
          <template #icon><icon-provider provider-id="bloggerPage"></icon-provider></template>
          <div>Publish to Blogger Page</div>
          <span>{{ token.name }}</span>
        </menu-entry>
      </div>
      <div v-for="token in dropboxTokens" :key="token.sub">
        <menu-entry @click.native="publishDropbox(token)">
          <template #icon><icon-provider provider-id="dropbox"></icon-provider></template>
          <div>Publish to Dropbox</div>
          <span>{{ token.name }}</span>
        </menu-entry>
      </div>
      <div v-for="token in githubTokens" :key="token.sub">
        <menu-entry @click.native="publishGist(token)">
          <template #icon><icon-provider provider-id="gist"></icon-provider></template>
          <div>Publish to Gist</div>
          <span>{{ token.name }}</span>
        </menu-entry>
        <menu-entry @click.native="publishGithub(token)">
          <template #icon><icon-provider provider-id="github"></icon-provider></template>
          <div>Publish to GitHub</div>
          <span>{{ token.name }}</span>
        </menu-entry>
      </div>
      <div v-for="token in gitlabTokens" :key="token.sub">
        <menu-entry @click.native="publishGitlab(token)">
          <template #icon><icon-provider provider-id="gitlab"></icon-provider></template>
          <div>Publish to GitLab</div>
          <span>{{ token.name }}</span>
        </menu-entry>
      </div>
      <div v-for="token in googleDriveTokens" :key="token.sub">
        <menu-entry @click.native="publishGoogleDrive(token)">
          <template #icon><icon-provider provider-id="googleDrive"></icon-provider></template>
          <div>Publish to Google Drive</div>
          <span>{{ token.name }}</span>
        </menu-entry>
      </div>
      <div v-for="token in wordpressTokens" :key="token.sub">
        <menu-entry @click.native="publishWordpress(token)">
          <template #icon><icon-provider provider-id="wordpress"></icon-provider></template>
          <div>Publish to WordPress</div>
          <span>{{ token.name }}</span>
        </menu-entry>
      </div>
      <div v-for="token in zendeskTokens" :key="token.sub">
        <menu-entry @click.native="publishZendesk(token)">
          <template #icon><icon-provider provider-id="zendesk"></icon-provider></template>
          <div>Publish to Zendesk Help Center</div>
          <span>{{ token.name }} — {{ token.subdomain }}</span>
        </menu-entry>
      </div>
      <hr>
      <menu-entry @click.native="addBloggerAccount">
        <template #icon><icon-provider provider-id="blogger"></icon-provider></template>
        <span>Add Blogger account</span>
      </menu-entry>
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
      <menu-entry @click.native="addWordpressAccount">
        <template #icon><icon-provider provider-id="wordpress"></icon-provider></template>
        <span>Add WordPress account</span>
      </menu-entry>
      <menu-entry @click.native="addZendeskAccount">
        <template #icon><icon-provider provider-id="zendesk"></icon-provider></template>
        <span>Add Zendesk account</span>
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
import wordpressHelper from '../../services/providers/helpers/wordpressHelper';
import zendeskHelper from '../../services/providers/helpers/zendeskHelper';
import publishSvc from '../../services/publishSvc';
import { usePublishLocationStore, PublishLocation } from '../../stores/publishLocation';
import { useFileStore } from '../../stores/file';
import { useModalStore } from '../../stores/modal';
import { useDataStore } from '../../stores/data';
import { useQueueStore } from '../../stores/queue';

const tokensToArray = (tokens: Record<string, any>, filter: (token: any) => boolean = () => true) => Object.values(tokens)
  .filter((token: any) => filter(token))
  .sort((token1: any, token2: any) => token1.name.localeCompare(token2.name));

const publishModalOpener = (type: string, featureId: string) => async (token: any) => {
  try {
    const publishLocation = await useModalStore().open({
      type,
      token,
    }) as PublishLocation;
    publishSvc.createPublishLocation(publishLocation as any, featureId);
  } catch (e) { /* cancel */ }
};

export default defineComponent({
  components: {
    MenuEntry,
  },
  computed: {
    ...mapPiniaState(useQueueStore, [
      'isPublishRequested',
    ]),
    ...mapPiniaState(useFileStore, [
      'isCurrentTemp',
    ]),
    publishLocations(): unknown[] {
      // current/currentWithWorkspaceSyncLocation are runtime getters on the
      // location-store factory that aren't surfaced in its inferred type.
      return usePublishLocationStore().current;
    },
    locationCount() {
      return Object.keys(this.publishLocations).length;
    },
    currentFileName() {
      return `"${useFileStore().current.name}"`;
    },
    bloggerTokens() {
      return tokensToArray(useDataStore().googleTokensBySub, (token: any) => token.isBlogger);
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
    wordpressTokens() {
      return tokensToArray(useDataStore().wordpressTokensBySub);
    },
    zendeskTokens() {
      return tokensToArray(useDataStore().zendeskTokensBySub);
    },
    noToken() {
      return !this.bloggerTokens.length
        && !this.dropboxTokens.length
        && !this.githubTokens.length
        && !this.gitlabTokens.length
        && !this.googleDriveTokens.length
        && !this.wordpressTokens.length
        && !this.zendeskTokens.length;
    },
  },
  methods: {
    requestPublish() {
      if (!this.isPublishRequested) {
        publishSvc.requestPublish();
      }
    },
    async managePublish() {
      try {
        await useModalStore().open('publishManagement');
      } catch (e) { /* cancel */ }
    },
    async addBloggerAccount() {
      try {
        await googleHelper.addBloggerAccount();
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
        const { serverUrl, applicationId } = await useModalStore().open({ type: 'gitlabAccount' }) as any;
        await gitlabHelper.addAccount(serverUrl, applicationId);
      } catch (e) { /* cancel */ }
    },
    async addGoogleDriveAccount() {
      try {
        await useModalStore().open({ type: 'googleDriveAccount' });
        await googleHelper.addDriveAccount(!useDataStore().localSettings.googleDriveRestrictedAccess);
      } catch (e) { /* cancel */ }
    },
    async addWordpressAccount() {
      try {
        await wordpressHelper.addAccount();
      } catch (e) { /* cancel */ }
    },
    async addZendeskAccount() {
      try {
        const { subdomain, clientId } = await useModalStore().open({ type: 'zendeskAccount' }) as any;
        await zendeskHelper.addAccount(subdomain, clientId);
      } catch (e) { /* cancel */ }
    },
    publishBlogger: publishModalOpener('bloggerPublish', 'publishToBlogger'),
    publishBloggerPage: publishModalOpener('bloggerPagePublish', 'publishToBloggerPage'),
    publishDropbox: publishModalOpener('dropboxPublish', 'publishToDropbox'),
    publishGithub: publishModalOpener('githubPublish', 'publishToGithub'),
    publishGist: publishModalOpener('gistPublish', 'publishToGist'),
    publishGitlab: publishModalOpener('gitlabPublish', 'publishToGitlab'),
    publishGoogleDrive: publishModalOpener('googleDrivePublish', 'publishToGoogleDrive'),
    publishWordpress: publishModalOpener('wordpressPublish', 'publishToWordPress'),
    publishZendesk: publishModalOpener('zendeskPublish', 'publishToZendesk'),
  },
});
</script>
