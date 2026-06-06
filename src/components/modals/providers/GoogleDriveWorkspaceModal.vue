<template>
  <modal-inner aria-label="Add Google Drive workspace">
    <div class="modal__content">
      <div class="modal__image">
        <icon-provider provider-id="googleDrive"></icon-provider>
      </div>
      <p>Create a workspace synced with a <b>Google Drive</b> folder.</p>
      <form-entry label="Folder ID" info="optional">
        <template #field><input class="textfield" type="text" v-model.trim="folderId" @keydown.enter="resolve()"></template>
        <div class="form-entry__info">
          If not supplied, a new workspace folder will be created in your Drive root folder.
        </div>
        <div class="form-entry__actions">
          <a href="javascript:void(0)" @click="openFolder">Choose folder</a>
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
import googleHelper from '../../../services/providers/helpers/googleHelper';
import baseModal from '../common/baseModal';
import { localSetting } from '../common/localSetting';
import utils from '../../../services/utils';
import { useModalStore } from '../../../stores/modal';
import { useDataStore } from '../../../stores/data';

export default defineComponent({
  mixins: [baseModal],
  computed: {
    folderId: localSetting('googleDriveWorkspaceFolderId'),
  },
  methods: {
    openFolder() {
      return useModalStore().hideUntil(
        googleHelper.openPicker(this.config.token, 'folder')
          .then((folders) => {
            if (folders[0]) {
              useDataStore().patchLocalSettings({
                googleDriveWorkspaceFolderId: folders[0].id,
              });
            }
          }),
      );
    },
    resolve() {
      const url = utils.addQueryParams('app', {
        providerId: 'googleDriveWorkspace',
        folderId: this.folderId,
        sub: (this.config.token as any).sub,
      }, true);
      this.config.resolve();
      window.open(url);
    },
  },
});
</script>
