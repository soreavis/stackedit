// Persist a small amount of UI state (open folders + current file id)
// across page reloads via localStorage so the user lands back where they
// left off. Intentionally NOT using IndexedDB — this is session/UI state,
// not documents, and synchronous reads during boot are preferable.

import { useFileStore } from '../stores/file';
import { useDataStore } from '../stores/data';
import { useExplorerStore } from '../stores/explorer';

const OPEN_NODES_KEY = 'stackedit.ui.openNodes';
const CURRENT_ID_KEY = 'stackedit.ui.currentId';

let bound = false;

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / private mode — ignore.
  }
}

function restoreOpenNodes(): void {
  const saved = readJson(OPEN_NODES_KEY);
  if (saved && typeof saved === 'object') {
    useExplorerStore().setOpenNodes(saved as Record<string, boolean>);
  }
}

function restoreCurrentId(): void {
  const id = (() => {
    try { return localStorage.getItem(CURRENT_ID_KEY); } catch { return null; }
  })();
  if (!id) return;
  const file = (useFileStore().itemsById as Record<string, any>)[id];
  if (!file || file.parentId === 'trash') return;
  if (useFileStore().currentId !== id) {
    useFileStore().setCurrentId(id);
  }
}

function bindSubscriptions(): void {
  if (bound) return;
  bound = true;
  // Persist openNodes whenever the explorer state changes.
  useExplorerStore().$subscribe(() => {
    writeJson(OPEN_NODES_KEY, useExplorerStore().openNodes || {});
  });
  // file is in Pinia. Watch currentId via $subscribe.
  let lastCurrentId = useFileStore().currentId;
  useFileStore().$subscribe((_mutation: any, state: any) => {
    if (state.currentId !== lastCurrentId) {
      lastCurrentId = state.currentId;
      try {
        if (state.currentId) localStorage.setItem(CURRENT_ID_KEY, state.currentId);
        else localStorage.removeItem(CURRENT_ID_KEY);
      } catch {
        // ignore
      }
    }
  });
}

// Freeze the "Recent" folder ordering at the start of the session so
// clicking a file (which bumps its lastOpened timestamp) doesn't shuffle
// the list under the user. Reload reseeds.
function seedRecentSnapshot(): void {
  const lastOpened: Record<string, number> = useDataStore().lastOpened || {};
  const snapshot = Object.entries(lastOpened)
    .sort((a, b) => b[1] - a[1])
    .map(([id, ts]) => ({ id, ts }))
    .filter((entry) => {
      const f = (useFileStore().itemsById as Record<string, any>)[entry.id];
      return f && f.parentId !== 'trash';
    })
    .slice(0, 10);
  useExplorerStore().setRecentSnapshot(snapshot);
}

export default {
  // Call once, as early as possible, before any UI interaction. Safe to
  // call before file.itemsById is hydrated — open-folder restore is
  // purely id→boolean so order doesn't matter.
  restoreEarly(): void {
    restoreOpenNodes();
    bindSubscriptions();
  },
  // Call after file.itemsById is hydrated (e.g. end of localDbSvc.init)
  // so the current-id lookup can verify the file still exists outside
  // Trash.
  restoreCurrentFile(): void {
    restoreCurrentId();
    seedRecentSnapshot();
  },
};
