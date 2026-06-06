<template>
  <modal-inner aria-label="GitLab account">
    <div class="modal__content">
      <div class="modal__image">
        <icon-provider provider-id="gitlab"></icon-provider>
      </div>
      <p>Link your <b>GitLab</b> account to <b>StackEdit</b>.</p>
      <form-entry label="GitLab URL" error="serverUrl">
        <template #field v-if="config.forceServerUrl"><input class="textfield" type="text" :disabled="true" v-model="config.forceServerUrl"></template>
        <template #field v-else><input class="textfield" type="text" v-model.trim="serverUrl" @keydown.enter="resolve()"></template>
        <div class="form-entry__info">
          <b>Example:</b> https://gitlab.example.com/
        </div>
      </form-entry>
      <form-entry label="Application ID" error="applicationId">
        <template #field><input class="textfield" type="text" v-model.trim="applicationId" @keydown.enter="resolve()"></template>
        <div class="form-entry__info">
          You have to configure an OAuth2 Application with redirect URL <b>{{ redirectUrl }}</b>
        </div>
        <div class="form-entry__actions">
          <a href="https://docs.gitlab.com/ee/integration/oauth_provider.html" target="_blank" rel="noopener noreferrer">More info</a>
        </div>
      </form-entry>
    </div>
    <div class="modal__button-bar">
      <button class="button" @click="config.reject()">Cancel</button>
      <button class="button button--resolve" @click="resolve()">Ok</button>
    </div>
  </modal-inner>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import baseModal from '../common/baseModal';
import { localSetting } from '../common/localSetting';
import constants from '../../../data/constants';

export default defineComponent({
  mixins: [baseModal],
  data: () => ({
    redirectUrl: constants.oauth2RedirectUri,
  }),
  computed: {
    serverUrl: localSetting('gitlabServerUrl'),
    applicationId: localSetting('gitlabApplicationId'),
  },
  methods: {
    resolve() {
      const serverUrl = this.config.forceServerUrl || this.serverUrl;
      if (!serverUrl) {
        this.setError('serverUrl');
      }
      if (!this.applicationId) {
        this.setError('applicationId');
      }
      if (serverUrl && this.applicationId) {
        const parsedUrl = serverUrl.match(/^(https:\/\/[^/]+)/);
        if (!parsedUrl) {
          this.setError('serverUrl');
        } else {
          this.config.resolve({
            serverUrl: parsedUrl[1],
            applicationId: this.applicationId,
          });
        }
      }
    },
  },
});
</script>
