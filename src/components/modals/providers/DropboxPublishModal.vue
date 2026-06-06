<template>
  <modal-inner aria-label="Publish to Dropbox">
    <div class="modal__content">
      <div class="modal__image">
        <icon-provider provider-id="dropbox"></icon-provider>
      </div>
      <p>Publish <b>{{ currentFileName }}</b> to your <b>Dropbox</b>.</p>
      <form-entry label="File path" error="path">
        <template #field><input class="textfield" type="text" v-model.trim="path" @keydown.enter="resolve()"></template>
        <div class="form-entry__info">
          <b>Example:</b> {{ token.fullAccess ? '' : '/Applications/StackEdit (restricted)' }}/path/to/My Document.html<br>
          If the file exists, it will be overwritten.
        </div>
      </form-entry>
      <form-entry label="Template">
        <template #field>
          <select class="textfield" v-model="selectedTemplate" @keydown.enter="resolve()">
            <option v-for="(template, id) in allTemplatesById" :key="id" :value="id">
              {{ template.name }}{{ template.description ? ' · ' + template.description : '' }}
            </option>
          </select>
        </template>
        <div class="form-entry__actions">
          <a href="javascript:void(0)" @click="configureTemplates">Configure templates</a>
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
import dropboxProvider from '../../../services/providers/dropboxProvider';
import baseModal from '../common/baseModal';
import { localSetting } from '../common/localSetting';
import templatePickerModal from '../common/templatePickerModal';

export default defineComponent({
  mixins: [baseModal, templatePickerModal],
  data: () => ({
    path: '',
    templateSettingId: 'dropboxPublishTemplate',
  }),
  computed: {
    selectedTemplate: localSetting('dropboxPublishTemplate'),
    token(): any {
      return this.config.token;
    },
  },
  created() {
    this.path = `/${this.currentFileName}.html`;
  },
  methods: {
    resolve() {
      if (!(dropboxProvider as any).checkPath(this.path)) {
        this.setError('path');
      } else {
        // Return new location
        const location = (dropboxProvider as any).makeLocation(this.config.token, this.path);
        location.templateId = this.selectedTemplate;
        this.config.resolve(location);
      }
    },
  },
});
</script>
