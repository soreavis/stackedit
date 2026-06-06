<template>
  <modal-inner aria-label="Synchronize with Google Drive">
    <div class="modal__content">
      <div class="modal__image">
        <icon-provider provider-id="googleDrive"></icon-provider>
      </div>
      <p>Save <b>{{ currentFileName }}</b> to your <b>Google Drive</b> account and keep it synced.</p>
      <form-entry label="Folder ID" info="optional">
        <template #field><input class="textfield" type="text" v-model.trim="folderId" @keydown.enter="resolve()"></template>
        <div class="form-entry__info">
          If not supplied, the file will be created in your Drive root folder.
        </div>
        <div class="form-entry__actions">
          <a href="javascript:void(0)" @click="openFolder">Choose folder</a>
        </div>
      </form-entry>
      <form-entry label="Existing file ID" info="optional">
        <template #field><input class="textfield" type="text" v-model.trim="fileId" @keydown.enter="resolve()"></template>
        <div class="form-entry__info">
          This will overwrite the file on the server.
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
import googleDriveProvider from '../../../services/providers/googleDriveProvider';
import baseModal from '../common/baseModal';
import { localSetting } from '../common/localSetting';
import { useModalStore } from '../../../stores/modal';
import { useDataStore } from '../../../stores/data';

export default defineComponent({
  mixins: [baseModal],
  data: () => ({
    fileId: '',
  }),
  computed: {
    folderId: localSetting('googleDriveFolderId'),
  },
  methods: {
    openFolder() {
      return useModalStore().hideUntil(
        googleHelper.openPicker(this.config.token, 'folder')
          .then((folders: any[]) => {
            if (folders[0]) {
              useDataStore().patchLocalSettings({
                googleDriveFolderId: folders[0].id,
              });
            }
          }),
      );
    },
    resolve() {
      // Return new location
      const location = (googleDriveProvider as any).makeLocation(
        this.config.token,
        this.fileId,
        this.folderId,
      );
      this.config.resolve(location);
    },
  },
});
</script>
