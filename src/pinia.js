// Bootstrap Pinia eagerly. This module is imported FIRST in
// src/index.js (before any other module that might call useFooStore()
// at module load), so the active Pinia instance is set up before
// service modules / store getters can reference Pinia stores.
//
// Without this, Vuex getters (e.g. layout/styles) that delegate to
// Pinia stores (useFileStore().isCurrentTemp) crash at boot because
// scrollSync.ts registers a watcher that eagerly evaluates the getter
// before main.js calls `new Vue({ pinia })`.
import Vue from 'vue';
import { createPinia, PiniaVuePlugin, setActivePinia } from 'pinia';

Vue.use(PiniaVuePlugin);
const pinia = createPinia();
// Make this pinia the active one for outside-component usage during
// app bootstrap. New Vue({ pinia }) below also wires it for components.
setActivePinia(pinia);

export default pinia;
