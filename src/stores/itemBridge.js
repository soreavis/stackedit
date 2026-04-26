// Transitional bridge for callers that dispatch type-keyed setItem /
// patchItem / deleteItem calls (workspaceSvc, localDbSvc, syncSvc,
// publishSvc) when the type is determined at runtime. Some types live
// in Pinia, others still in Vuex. Once the migration finishes, this
// file can be removed and callers can route directly to the Pinia
// stores.

import vuexStore from '../store';
import { useFolderStore } from './folder';
import { useSyncedContentStore } from './syncedContent';
import { useContentStateStore } from './contentState';
import { useFileStore } from './file';
import { useContentStore } from './content';

const piniaStores = {
  folder: useFolderStore,
  syncedContent: useSyncedContentStore,
  contentState: useContentStateStore,
  file: useFileStore,
  content: useContentStore,
};

export function setItemByType(type, value) {
  const piniaStore = piniaStores[type];
  if (piniaStore) {
    piniaStore().setItem(value);
  } else {
    vuexStore.commit(`${type}/setItem`, value);
  }
}

export function patchItemByType(type, patch) {
  const piniaStore = piniaStores[type];
  if (piniaStore) {
    return piniaStore().patchItem(patch);
  }
  vuexStore.commit(`${type}/patchItem`, patch);
  return undefined;
}

export function deleteItemByType(type, id) {
  const piniaStore = piniaStores[type];
  if (piniaStore) {
    piniaStore().deleteItem(id);
  } else {
    vuexStore.commit(`${type}/deleteItem`, id);
  }
}
