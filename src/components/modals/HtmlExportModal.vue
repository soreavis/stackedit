<template>
  <modal-inner aria-label="Export to HTML">
    <div class="modal__content">
      <p>Please choose a template for your <b>HTML export</b>.</p>
      <form-entry label="Template">
        <select class="textfield" slot="field" v-model="selectedTemplate" @keydown.enter="resolve()">
          <option v-for="(template, id) in allTemplatesById" :key="id" :value="id">
            {{ template.name }}{{ template.description ? ' · ' + template.description : '' }}
          </option>
        </select>
        <div class="form-entry__actions">
          <a href="javascript:void(0)" @click="configureTemplates">Configure templates</a>
        </div>
      </form-entry>
    </div>
    <div class="modal__button-bar">
      <button class="button button--copy" v-clipboard="result" @click="info('HTML copied to clipboard!')">Copy</button>
      <button class="button" @click="config.reject()">Cancel</button>
      <button class="button button--resolve" @click="resolve()">Ok</button>
    </div>
  </modal-inner>
</template>

<script>
import { mapActions as mapPiniaActions } from 'pinia';
import exportSvc from '../../services/exportSvc';
import modalTemplate from './common/modalTemplate';
import { useFileStore } from '../../stores/file';
import { useNotificationStore } from '../../stores/notification';
import badgeSvc from '../../services/badgeSvc';

export default modalTemplate({
  data: () => ({
    result: '',
  }),
  computedLocalSettings: {
    selectedTemplate: 'htmlExportTemplate',
  },
  mounted() {
    let timeoutId;
    this.$watch('selectedTemplate', (selectedTemplate) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        const currentFile = useFileStore().current;
        const html = await exportSvc.applyTemplate(
          currentFile.id,
          this.allTemplatesById[selectedTemplate],
        );
        this.result = html;
      }, 10);
    }, {
      immediate: true,
    });
  },
  methods: {
    ...mapPiniaActions(useNotificationStore, [
      'info',
    ]),
    async resolve() {
      const { config } = this;
      const currentFile = useFileStore().current;
      config.resolve();
      await exportSvc.exportToDisk(currentFile.id, 'html', this.allTemplatesById[this.selectedTemplate]);
      badgeSvc.addBadge('exportHtml');
    },
  },
});
</script>
