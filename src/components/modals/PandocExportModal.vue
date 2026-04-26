<template>
  <modal-inner aria-label="Export with Pandoc">
    <div class="modal__content">
      <p>Please choose a format for your <b>Pandoc export</b>.</p>
      <form-entry label="Template">
        <select class="textfield" slot="field" v-model="selectedFormat" @keydown.enter="resolve()">
          <option value="asciidoc">AsciiDoc</option>
          <option value="context">ConTeXt</option>
          <option value="epub">EPUB</option>
          <option value="epub3">EPUB v3</option>
          <option value="latex">LaTeX</option>
          <option value="odt">OpenOffice</option>
          <option value="pdf">PDF</option>
          <option value="rst">reStructuredText</option>
          <option value="rtf">Rich Text Format</option>
          <option value="textile">Textile</option>
          <option value="docx">Word</option>
        </select>
      </form-entry>
    </div>
    <div class="modal__button-bar">
      <button class="button" @click="config.reject()">Cancel</button>
      <button class="button button--resolve" @click="resolve()">Ok</button>
    </div>
  </modal-inner>
</template>

<script>
import FileSaver from 'file-saver';
import networkSvc from '../../services/networkSvc';
import editorSvc from '../../services/editorSvc';
import googleHelper from '../../services/providers/helpers/googleHelper';
import modalTemplate from './common/modalTemplate';
import { useWorkspaceStore } from '../../stores/workspace';
import { useContentStore } from '../../stores/content';
import { useFileStore } from '../../stores/file';
import { useModalStore } from '../../stores/modal';
import { useNotificationStore } from '../../stores/notification';
import badgeSvc from '../../services/badgeSvc';
import { useQueueStore } from '../../stores/queue';
import { useDataStore } from '../../stores/data';

export default modalTemplate({
  computedLocalSettings: {
    selectedFormat: 'pandocExportFormat',
  },
  methods: {
    async resolve() {
      this.config.resolve();
      const currentFile = useFileStore().current;
      const currentContent = useContentStore().current;
      const { selectedFormat } = this;
      useQueueStore().enqueue(async () => {
        const tokenToRefresh = useWorkspaceStore().sponsorToken;
        const sponsorToken = tokenToRefresh && await googleHelper.refreshToken(tokenToRefresh);

        try {
          const { body } = await networkSvc.request({
            method: 'POST',
            url: 'pandocExport',
            params: {
              idToken: sponsorToken && sponsorToken.idToken,
              format: selectedFormat,
              options: JSON.stringify(useDataStore().computedSettings.pandoc),
              metadata: JSON.stringify(currentContent.properties),
            },
            body: JSON.stringify(editorSvc.getPandocAst()),
            blob: true,
            timeout: 60000,
          });
          FileSaver.saveAs(body, `${currentFile.name}.${selectedFormat}`);
          badgeSvc.addBadge('exportPandoc');
        } catch (err) {
          if (err.status === 401) {
            useModalStore().open('sponsorOnly');
          } else {
            console.error(err);  
            useNotificationStore().error(err);
          }
        }
      });
    },
  },
});
</script>
