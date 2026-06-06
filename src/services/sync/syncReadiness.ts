import { useWorkspaceStore } from '../../stores/workspace';
import { useSyncLocationStore } from '../../stores/syncLocation';
import { useGlobalStore } from '../../stores/global';
import { useDataStore } from '../../stores/data';

const minAutoSyncEvery = 60 * 1000; // 60 sec
const inactivityThreshold = 3 * 1000; // 3 sec

// A lock in local storage prevents multiple windows from syncing
// concurrently. `lastSyncActivity` is this window's view of the lock;
// it is owned here and only ever read via `isSyncWindow` / written via
// `setLastSyncActivity`.
let lastSyncActivity: number | undefined;

const getLastStoredSyncActivity = (): number =>
  parseInt(localStorage.getItem(useWorkspaceStore().lastSyncActivityKey) || '', 10) || 0;

/**
 * Return true if workspace sync is possible.
 */
const isWorkspaceSyncPossible = (): boolean => !!useWorkspaceStore().syncToken;

/**
 * Return true if file has at least one explicit sync location.
 */
const hasCurrentFileSyncLocations = (): boolean => !!useSyncLocationStore().current.length;

/**
 * Return true if we are online and we have something to sync.
 */
const isSyncPossible = (): boolean => !useGlobalStore().offline &&
  (isWorkspaceSyncPossible() || hasCurrentFileSyncLocations());

/**
 * Return true if we are the main window, ie we have the lastSyncActivity lock.
 */
const isSyncWindow = (): boolean => {
  const storedLastSyncActivity = getLastStoredSyncActivity();
  return lastSyncActivity === storedLastSyncActivity ||
    Date.now() > inactivityThreshold + storedLastSyncActivity;
};

/**
 * Return true if auto sync can start, ie if lastSyncActivity is old enough.
 */
const isAutoSyncReady = (): boolean => {
  let { autoSyncEvery } = useDataStore().computedSettings as any;
  if (autoSyncEvery < minAutoSyncEvery) {
    autoSyncEvery = minAutoSyncEvery;
  }
  return Date.now() > autoSyncEvery + getLastStoredSyncActivity();
};

/**
 * Update the lastSyncActivity, assuming we have the lock.
 */
const setLastSyncActivity = (): void => {
  const currentDate = Date.now();
  lastSyncActivity = currentDate;
  localStorage.setItem(useWorkspaceStore().lastSyncActivityKey, `${currentDate}`);
};

export {
  getLastStoredSyncActivity,
  isWorkspaceSyncPossible,
  hasCurrentFileSyncLocations,
  isSyncPossible,
  isSyncWindow,
  isAutoSyncReady,
  setLastSyncActivity,
};
