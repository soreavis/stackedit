import Vue from 'vue';
import { registerSW } from 'virtual:pwa-register';
import './extensions';
import './services/optional';
import './icons';
import App from './components/App';
import store from './store';
import localDbSvc from './services/localDbSvc';

if (!indexedDB) {
  throw new Error('Your browser is not supported. Please upgrade to the latest version.');
}

const updateSW = registerSW({
  onNeedRefresh: async () => {
    if (!store.state.light) {
      await localDbSvc.sync();
      localStorage.updated = true;
      updateSW(true);
    }
  },
});

if (localStorage.updated) {
  store.dispatch('notification/info', 'StackEdit has just updated itself!');
  setTimeout(() => localStorage.removeItem('updated'), 2000);
}

if (!localStorage.installPrompted) {
  window.addEventListener('beforeinstallprompt', async (promptEvent) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    promptEvent.preventDefault();

    try {
      await store.dispatch('notification/confirm', 'Add StackEdit to your home screen?');
      promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (err) {
      // Cancel
    }
    localStorage.installPrompted = true;
  });
}

Vue.config.productionTip = false;

/* eslint-disable no-new */
new Vue({
  el: '#app',
  store,
  render: h => h(App),
});
