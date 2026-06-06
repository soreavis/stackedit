<template>
  <div class="side-bar__panel side-bar__panel--menu">
    <input class="hidden-file" id="import-backup-file-input" type="file" @change="onImportBackup">
    <label class="menu-entry button flex flex--row flex--align-center" for="import-backup-file-input">
      <div class="menu-entry__icon flex flex--column flex--center">
        <icon-content-save></icon-content-save>
      </div>
      <div class="flex flex--column">
        Import workspace backup
      </div>
    </label>
    <menu-entry @click.native="exportWorkspace">
      <template #icon><icon-content-save></icon-content-save></template>
      Export workspace backup
    </menu-entry>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import FileSaver from 'file-saver';
import MenuEntry from './common/MenuEntry.vue';
import { useWorkspaceStore } from '../../stores/workspace';
import { useNotificationStore } from '../../stores/notification';
import backupSvc from '../../services/backupSvc';
import localDbSvc from '../../services/localDbSvc';

export default defineComponent({
  components: {
    MenuEntry,
  },
  computed: {
    workspaceId(): string {
      return useWorkspaceStore().currentWorkspace.id as string;
    },
  },
  methods: {
    onImportBackup(evt: Event) {
      const file = (evt.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
          const text = e.target?.result as string;
          if (text.match(/\uFFFD/)) {
            useNotificationStore().error('File is not readable.');
          } else {
            backupSvc.importBackup(text);
          }
        };
        const blob = file.slice(0, 10000000);
        reader.readAsText(blob);
      }
    },
    exportWorkspace() {
      const allItemsById: Record<string, unknown> = {};
      localDbSvc.getWorkspaceItems(this.workspaceId, (item) => {
        allItemsById[item.id] = item;
      }, () => {
        const backup = JSON.stringify(allItemsById);
        const blob = new Blob([backup], {
          type: 'text/plain;charset=utf-8',
        });
        FileSaver.saveAs(blob, 'StackEdit workspace.json');
      });
    },
  },
});
</script>
