// Bootstrap Pinia eagerly. This module is imported FIRST in
// src/index.js (before any other module that might call useFooStore()
// at module load), so the active Pinia instance is set up before
// service modules / store getters can reference Pinia stores.
//
// Without this, store getters (e.g. layout/styles) that delegate to
// other Pinia stores (useFileStore().isCurrentTemp) crash at boot because
// scrollSync.ts registers a watcher that eagerly evaluates the getter
// before index.js mounts the app.
//
// Vue 3 path: no PiniaVuePlugin (that's the Vue-2 shim). The app wires
// pinia via `app.use(pinia)` in index.js; setActivePinia covers the
// outside-component usage during bootstrap.
import { createPinia, setActivePinia, type Pinia } from 'pinia';

const pinia: Pinia = createPinia();
setActivePinia(pinia);

export default pinia;
