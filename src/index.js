import Vue from 'vue';
import DOMPurify from 'dompurify';
import { inject as injectAnalytics } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { registerSW } from 'virtual:pwa-register';
import './extensions';
import './services/optional';
import './icons';
import App from './components/App';
import store from './store';
import localDbSvc from './services/localDbSvc';

// Skew protection: when a Vite deploy ships new chunk hashes, a long-open
// tab may fail to dynamically load the old hash. Catch and reload to pick
// up the latest manifest. Must register before any dynamic import().
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  window.location.reload();
});

// Vercel Analytics + Web Vitals. No-ops outside a Vercel deployment.
injectAnalytics();
injectSpeedInsights();

if (window.trustedTypes && window.trustedTypes.createPolicy) {
  try {
    window.trustedTypes.createPolicy('default', {
      createHTML: html => DOMPurify.sanitize(html),
      createScript: s => s,
      createScriptURL: s => s,
    });
  } catch {
    // policy already exists (HMR) — ignore
  }
}

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
