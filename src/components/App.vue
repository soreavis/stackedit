<template>
  <div class="app" :class="classes" @keydown.esc="close">
    <splash-screen v-if="!ready"></splash-screen>
    <layout v-else></layout>
    <modal></modal>
    <notification></notification>
    <context-menu></context-menu>
  </div>
</template>

<script>
import '../styles';
import '../styles/markdownHighlighting.scss';
import '../styles/app.scss';
import Layout from './Layout';
import Modal from './Modal';
import Notification from './Notification';
import ContextMenu from './ContextMenu';
import SplashScreen from './SplashScreen';
import syncSvc from '../services/syncSvc';
import networkSvc from '../services/networkSvc';
import tempFileSvc from '../services/tempFileSvc';
import uiPersistence from '../services/uiPersistence';
import { useFileStore } from '../stores/file';
import { useNotificationStore } from '../stores/notification';
import { useDataStore } from '../stores/data';
import './common/vueGlobals';

const themeClasses = {
  light: ['app--light'],
  dark: ['app--dark'],
};

export default {
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
      const result = themeClasses[useDataStore().computedSettings.colorTheme];
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
      this.ready = true;
      tempFileSvc.setReady();
    } catch (err) {
      if (err && err.message === 'RELOAD') {
        window.location.reload();
      } else if (err && err.message !== 'RELOAD') {
        console.error(err);  
        useNotificationStore().error(err);
      }
    }
  },
  methods: {
    close() {
      tempFileSvc.close();
    },
  },
};
</script>
