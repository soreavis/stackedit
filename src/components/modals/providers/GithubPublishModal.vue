<template>
  <modal-inner aria-label="Publish to GitHub">
    <div class="modal__content">
      <div class="modal__image">
        <icon-provider provider-id="github"></icon-provider>
      </div>
      <p>Publish <b>{{ currentFileName }}</b> to your <b>GitHub</b> repository.</p>
      <form-entry label="Repository URL" error="repoUrl">
        <template #field><input class="textfield" type="text" v-model.trim="repoUrl" @keydown.enter="resolve()"></template>
        <div class="form-entry__info">
          <b>Example:</b> https://github.com/owner/my-repo
        </div>
      </form-entry>
      <form-entry label="File path" error="path">
        <template #field><input class="textfield" type="text" v-model.trim="path" @keydown.enter="resolve()"></template>
        <div class="form-entry__info">
          <b>Example:</b> path/to/README.md<br>
          If the file exists, it will be overwritten.
        </div>
      </form-entry>
      <form-entry label="Branch" info="optional">
        <template #field><input class="textfield" type="text" v-model.trim="branch" @keydown.enter="resolve()"></template>
        <div class="form-entry__info">
          If not supplied, the <code>main</code> branch will be used (use <code>master</code> for older repos).
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
import githubProvider from '../../../services/providers/githubProvider';
import baseModal from '../common/baseModal';
import { localSetting } from '../common/localSetting';
import templatePickerModal from '../common/templatePickerModal';
import utils from '../../../services/utils';

export default defineComponent({
  mixins: [baseModal, templatePickerModal],
  data: () => ({
    branch: '',
    path: '',
    templateSettingId: 'githubPublishTemplate',
  }),
  computed: {
    repoUrl: localSetting('githubRepoUrl'),
    selectedTemplate: localSetting('githubPublishTemplate'),
  },
  created() {
    this.path = `${this.currentFileName}.md`;
  },
  methods: {
    resolve() {
      const parsedRepo = utils.parseGithubRepoUrl(this.repoUrl);
      if (!parsedRepo) {
        this.setError('repoUrl');
      }
      if (!this.path) {
        this.setError('path');
      }
      if (parsedRepo && this.path) {
        // Return new location
        const location = (githubProvider as any).makeLocation(
          this.config.token,
          parsedRepo.owner,
          parsedRepo.repo,
          this.branch || 'main',
          this.path,
        );
        location.templateId = this.selectedTemplate;
        this.config.resolve(location);
      }
    },
  },
});
</script>
