<template>
  <div class="app" :class="classes" @keydown.esc="close">
    <splash-screen v-if="!ready"></splash-screen>
    <layout v-else></layout>
    <modal></modal>
    <notification></notification>
    <context-menu></context-menu>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import '../styles';
import '../styles/markdownHighlighting.scss';
import '../styles/app.scss';
import Layout from './Layout.vue';
import Modal from './Modal.vue';
import Notification from './Notification.vue';
import ContextMenu from './ContextMenu.vue';
import SplashScreen from './SplashScreen.vue';
import syncSvc from '../services/syncSvc';
import networkSvc from '../services/networkSvc';
import tempFileSvc from '../services/tempFileSvc';
import uiPersistence from '../services/uiPersistence';
import { setCm6BridgeFactory } from '../services/editor/editorSvcDiscussions';
import { useNotificationStore } from '../stores/notification';
import { useDataStore } from '../stores/data';

const themeClasses: Record<string, string[]> = {
  light: ['app--light'],
  dark: ['app--dark'],
};

export default defineComponent({
  components: {
    Layout,
    Modal,
    Notification,
    ContextMenu,
    SplashScreen,
  },
  data: () => ({
    ready: false,
  }),
  computed: {
    classes() {
      const result = themeClasses[useDataStore().computedSettings.colorTheme as string];
      return Array.isArray(result) ? result : themeClasses.light;
    },
  },
  async created() {
    try {
      // Restore open folders + bind mutation subscribers as early as
      // possible so nothing collapses during the boot dance.
      uiPersistence.restoreEarly();
      await syncSvc.init();
      // Files are in useFileStore().itemsById now — safe to restore the
      // last-current file id so the user lands back on the document they
      // had open before the reload.
      uiPersistence.restoreCurrentFile();
      await networkSvc.init();
      // Stage 3 batch 11: CM6 is the only editor. Dynamic-import the
      // bridge module BEFORE Layout mounts so editorSvc.createClEditor
      // can use the bridge factory synchronously. Dynamic import keeps
      // the chunk lazy from a route-split perspective even though we
      // always need it — preserves the build output structure that the
      // size-limit gate is calibrated against.
      const mod = await import('../services/editor/cm6/cm6ClEditorBridge');
      setCm6BridgeFactory(mod.createCm6ClEditorBridge, mod.Cm6Marker);
      this.ready = true;
      tempFileSvc.setReady();
    } catch (err) {
      const e = err as any;
      if (e && e.message === 'RELOAD') {
        window.location.reload();
      } else if (e && e.message !== 'RELOAD') {
        console.error(e);
        useNotificationStore().error(e);
      }
    }
  },
  methods: {
    close() {
      tempFileSvc.close();
    },
  },
});
</script>
