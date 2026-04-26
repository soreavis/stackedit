<template>
  <modal-inner aria-label="Insert image">
    <div class="modal__content">
      <p>Please provide a <b>URL</b> for your image.</p>
      <form-entry label="URL" error="url">
        <input slot="field" class="textfield" type="text" v-model.trim="url" @keydown.enter="resolve">
      </form-entry>
      <menu-entry @click.native="openGoogleDrive(token)" v-for="token in googleDriveTokens" :key="token.sub">
        <icon-provider slot="icon" provider-id="googleDrive"></icon-provider>
        <div>Open from Google Drive</div>
        <span>{{ token.name }}</span>
      </menu-entry>
      <menu-entry @click.native="addGoogleDriveAccount" v-if="!googleDriveTokens.length">
        <icon-provider slot="icon" provider-id="googleDrive"></icon-provider>
        <span>Add Google Drive account</span>
      </menu-entry>
    </div>
    <div class="modal__button-bar">
      <button class="button" @click="reject()">Cancel</button>
      <button class="button button--resolve" @click="resolve">Ok</button>
    </div>
  </modal-inner>
</template>

<script>
import modalTemplate from './common/modalTemplate';
import MenuEntry from '../menus/common/MenuEntry';
import googleHelper from '../../services/providers/helpers/googleHelper';
import { useModalStore } from '../../stores/modal';
import { useDataStore } from '../../stores/data';

export default modalTemplate({
  components: {
    MenuEntry,
  },
  data: () => ({
    url: '',
  }),
  computed: {
    googleDriveTokens() {
      const googleTokensBySub = useDataStore().googleTokensBySub;
      return Object.values(googleTokensBySub)
        .filter(token => token.isDrive)
        .sort((token1, token2) => token1.name.localeCompare(token2.name));
    },
  },
  methods: {
    resolve(evt) {
      evt.preventDefault(); // Fixes https://github.com/benweet/stackedit/issues/1503
      if (!this.url) {
        this.setError('url');
      } else {
        const { callback } = this.config;
        this.config.resolve();
        callback(this.url);
      }
    },
    reject() {
      const { callback } = this.config;
      this.config.reject();
      callback(null);
    },
    async addGoogleDriveAccount() {
      try {
        await googleHelper.addDriveAccount(!useDataStore().localSettings.googleDriveRestrictedAccess);
      } catch (e) { /* cancel */ }
    },
    async openGoogleDrive(token) {
      const { callback } = this.config;
      this.config.reject();
      const res = await googleHelper.openPicker(token, 'img');
      if (res[0]) {
        // Drive picker returns thumbnailUrl (lh3.googleusercontent.com) which
        // supports =sNNN resizing; doc.url is a drive.google.com view link
        // that is not directly embeddable in markdown.
        const imgUrl = res[0].thumbnailUrl || res[0].url;
        useModalStore().open({
          type: 'googlePhoto',
          url: imgUrl,
          callback,
        });
      }
    },
  },
});
</script>
