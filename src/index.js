import Vue from 'vue';
// Import pinia FIRST so the active Pinia instance is set up before any
// service module / Vuex getter that touches a Pinia store at boot.
// (e.g. scrollSync registers a Vuex watcher that evaluates layout/styles
// eagerly, which now reads useFileStore().isCurrentTemp.)
import pinia from './pinia';
import DOMPurify from 'dompurify';
import { inject as injectAnalytics } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { registerSW } from 'virtual:pwa-register';
import './extensions';
import './services/optional';
import './icons';
import App from './components/App';
import { useNotificationStore } from './stores/notification';
import localDbSvc from './services/localDbSvc';
import { useGlobalStore } from './stores/global';

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
  // New service-worker version is precached. Ask the user before
  // forcing the reload — silent auto-reloads were jarring (cursor lost,
  // unsynced edits dropped on slow networks). We still flush local-db
  // before reloading regardless of the user's choice on the next click.
  onNeedRefresh: async () => {
    if (useGlobalStore().light) return;
    try {
      await useNotificationStore().confirm('A new version of StackEdit is ready. Reload now?');
      await localDbSvc.sync();
      localStorage.updated = true;
      updateSW(true);
    } catch {
      // user dismissed — they'll get prompted again on next focus or
      // next service-worker check; nothing else to do here.
    }
  },
});

if (localStorage.updated) {
  useNotificationStore().info('StackEdit has just updated itself!');
  setTimeout(() => localStorage.removeItem('updated'), 2000);
}

if (!localStorage.installPrompted) {
  window.addEventListener('beforeinstallprompt', async (promptEvent) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    promptEvent.preventDefault();

    try {
      await useNotificationStore().confirm('Add StackEdit to your home screen?');
      promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (err) {
      // Cancel
    }
    localStorage.installPrompted = true;
  });
}

Vue.config.productionTip = false;

// Tick a counter every 30s so reactive getters that bucket relative
// dates (e.g. Recent folder labels in the explorer) re-render without
// each consumer wiring its own setInterval.
setInterval(() => {
  useGlobalStore().updateTimeCounter();
}, 30 * 1000);

new Vue({
  el: '#app',
  pinia,
  render: h => h(App),
});
