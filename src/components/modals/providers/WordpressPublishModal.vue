<template>
  <modal-inner aria-label="Publish to WordPress">
    <div class="modal__content">
      <div class="modal__image">
        <icon-provider provider-id="wordpress"></icon-provider>
      </div>
      <p>Publish <b>{{ currentFileName }}</b> to your <b>WordPress</b> site.</p>
      <form-entry label="Site domain" error="domain">
        <template #field><input class="textfield" type="text" v-model.trim="domain" @keydown.enter="resolve()"></template>
        <div class="form-entry__info">
          <b>Example:</b> example.wordpress.com<br>
          <b>Note:</b> Jetpack is required for self-hosted sites.
        </div>
      </form-entry>
      <form-entry label="Existing post ID" info="optional">
        <template #field><input class="textfield" type="text" v-model.trim="postId" @keydown.enter="resolve()"></template>
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
      <div class="modal__info">
        <b>ProTip:</b> You can provide values for <code>title</code>, <code>tags</code>,
        <code>categories</code>, <code>excerpt</code>, <code>author</code>, <code>featuredImage</code>,
        <code>status</code> and <code>date</code> in the <a href="javascript:void(0)" @click="openFileProperties">file properties</a>.
      </div>
    </div>
    <div class="modal__button-bar">
      <button class="button" @click="config.reject()">Cancel</button>
      <button class="button button--resolve" @click="resolve()">Ok</button>
    </div>
  </modal-inner>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import wordpressProvider from '../../../services/providers/wordpressProvider';
import baseModal from '../common/baseModal';
import { localSetting } from '../common/localSetting';
import templatePickerModal from '../common/templatePickerModal';

export default defineComponent({
  mixins: [baseModal, templatePickerModal],
  data: () => ({
    postId: '',
    templateSettingId: 'wordpressPublishTemplate',
  }),
  computed: {
    domain: localSetting('wordpressDomain'),
    selectedTemplate: localSetting('wordpressPublishTemplate'),
  },
  methods: {
    resolve() {
      if (!this.domain) {
        this.setError('domain');
      } else {
        // Return new location
        const location = (wordpressProvider as any).makeLocation(
          this.config.token,
          this.domain,
          this.postId,
        );
        location.templateId = this.selectedTemplate;
        this.config.resolve(location);
      }
    },
  },
});
</script>
