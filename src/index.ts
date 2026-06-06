import { createApp } from 'vue';
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
import icons from './icons';
import vueGlobals from './components/common/vueGlobals';
import App from './components/App.vue';
import { useNotificationStore } from './stores/notification';
import localDbSvc from './services/localDbSvc';
import { useGlobalStore } from './stores/global';

// Non-standard localStorage flags (`updated`, `installPrompted`) are read/written
// as properties; cast to bypass the Storage index typing.
const ls = localStorage as Storage & Record<string, string>;

// `beforeinstallprompt` is non-standard and not in the DOM lib.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<unknown>;
}

// Skew protection: when a Vite deploy ships new chunk hashes, a long-open
// tab may fail to dynamically load the old hash. Catch and reload to pick
// up the latest manifest. Must register before any dynamic import().
window.addEventListener('vite:preloadError', (event: Event) => {
  event.preventDefault();
  window.location.reload();
});

// Vercel Analytics + Web Vitals. No-ops outside a Vercel deployment.
injectAnalytics();
injectSpeedInsights();

const trustedTypes = (window as { trustedTypes?: any }).trustedTypes;
if (trustedTypes && trustedTypes.createPolicy) {
  try {
    trustedTypes.createPolicy('default', {
      createHTML: (html: string) => DOMPurify.sanitize(html),
      createScript: (s: string) => s,
      createScriptURL: (s: string) => s,
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
      ls.updated = 'true';
      updateSW(true);
    } catch {
      // user dismissed — they'll get prompted again on next focus or
      // next service-worker check; nothing else to do here.
    }
  },
});

if (ls.updated) {
  useNotificationStore().info('StackEdit has just updated itself!');
  setTimeout(() => localStorage.removeItem('updated'), 2000);
}

if (!ls.installPrompted) {
  window.addEventListener('beforeinstallprompt', async (promptEvent: Event) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    promptEvent.preventDefault();

    try {
      await useNotificationStore().confirm('Add StackEdit to your home screen?');
      (promptEvent as BeforeInstallPromptEvent).prompt();
      await (promptEvent as BeforeInstallPromptEvent).userChoice;
    } catch {
      // Cancel
    }
    ls.installPrompted = 'true';
  });
}

// Tick a counter every 30s so reactive getters that bucket relative
// dates (e.g. Recent folder labels in the explorer) re-render without
// each consumer wiring its own setInterval.
setInterval(() => {
  useGlobalStore().updateTimeCounter();
}, 30 * 1000);

createApp(App)
  .use(pinia)
  .use(icons)
  .use(vueGlobals)
  .mount('#app');
