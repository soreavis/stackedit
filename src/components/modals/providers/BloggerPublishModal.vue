<template>
  <modal-inner aria-label="Publish to Blogger">
    <div class="modal__content">
      <div class="modal__image">
        <icon-provider provider-id="blogger"></icon-provider>
      </div>
      <p>Publish <b>{{ currentFileName }}</b> to your <b>Blogger</b> site.</p>
      <form-entry label="Blog URL" error="blogUrl">
        <template #field><input class="textfield" type="text" v-model.trim="blogUrl" @keydown.enter="resolve()"></template>
        <div class="form-entry__info">
          <b>Example:</b> http://example.blogger.com/
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
import bloggerProvider from '../../../services/providers/bloggerProvider';
import baseModal from '../common/baseModal';
import { localSetting } from '../common/localSetting';
import templatePickerModal from '../common/templatePickerModal';

export default defineComponent({
  mixins: [baseModal, templatePickerModal],
  data: () => ({
    postId: '',
    templateSettingId: 'bloggerPublishTemplate',
  }),
  computed: {
    blogUrl: localSetting('bloggerBlogUrl'),
    selectedTemplate: localSetting('bloggerPublishTemplate'),
  },
  methods: {
    resolve() {
      if (!this.blogUrl) {
        this.setError('blogUrl');
      } else {
        // Return new location
        const location = (bloggerProvider as any).makeLocation(
          this.config.token,
          this.blogUrl,
          this.postId,
        );
        location.templateId = this.selectedTemplate;
        this.config.resolve(location);
      }
    },
  },
});
</script>
