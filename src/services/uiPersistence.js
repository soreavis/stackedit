// Persist a small amount of UI state (open folders + current file id)
// across page reloads via localStorage so the user lands back where they
// left off. Intentionally NOT using IndexedDB — this is session/UI state,
// not documents, and synchronous reads during boot are preferable.

import store from '../store';

const OPEN_NODES_KEY = 'stackedit.ui.openNodes';
const CURRENT_ID_KEY = 'stackedit.ui.currentId';

let bound = false;

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Quota / private mode — ignore.
  }
}

function restoreOpenNodes() {
  const saved = readJson(OPEN_NODES_KEY);
  if (saved && typeof saved === 'object') {
    store.commit('explorer/setOpenNodes', saved);
  }
}

function restoreCurrentId() {
  const id = (() => {
    try { return localStorage.getItem(CURRENT_ID_KEY); } catch (e) { return null; }
  })();
  if (!id) return;
  const file = store.state.file.itemsById[id];
  if (!file || file.parentId === 'trash') return;
  if (store.state.file.currentId !== id) {
    store.commit('file/setCurrentId', id);
  }
}

function bindSubscriptions() {
  if (bound) return;
  bound = true;
  store.subscribe((mutation) => {
    if (mutation.type === 'explorer/toggleOpenNode'
      || mutation.type === 'explorer/setOpenNodes'
    ) {
      writeJson(OPEN_NODES_KEY, store.state.explorer.openNodes || {});
      return;
    }
    if (mutation.type === 'file/setCurrentId') {
      const id = mutation.payload;
      try {
        if (id) localStorage.setItem(CURRENT_ID_KEY, id);
        else localStorage.removeItem(CURRENT_ID_KEY);
      } catch (e) {
        // ignore
      }
    }
  });
}

export default {
  // Call once, as early as possible, before any UI interaction. Safe to
  // call before file.itemsById is hydrated — open-folder restore is
  // purely id→boolean so order doesn't matter.
  restoreEarly() {
    restoreOpenNodes();
    bindSubscriptions();
  },
  // Call after file.itemsById is hydrated (e.g. end of localDbSvc.init)
  // so the current-id lookup can verify the file still exists outside
  // Trash.
  restoreCurrentFile() {
    restoreCurrentId();
  },
};
