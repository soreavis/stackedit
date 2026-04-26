import { mapState as mapPiniaState, mapActions as mapPiniaActions } from 'pinia';
import utils from './utils';
import store from '../store';
import { useWorkspaceStore } from '../stores/workspace';
import { useFileStore } from '../stores/file';
import { setItemByType, patchItemByType, deleteItemByType } from '../stores/itemBridge';
import { useNotificationStore } from '../stores/notification';
import welcomeFile from '../data/welcomeFile.md?raw';
import workspaceSvc from './workspaceSvc';
import draftFilesSvc from './draftFilesSvc';
import constants from '../data/constants';
import { useDataStore } from '../stores/data';
import { useDiscussionStore } from '../stores/discussion';
import { useExplorerStore } from '../stores/explorer';

interface DbItem {
  id: string;
  type: string;
  hash?: number;
  tx?: number;
  [key: string]: unknown;
}

type StoreItemMap = Record<string, DbItem>;

interface TxCb {
  onTx: (tx: IDBTransaction) => void;
  onError: () => void;
}

const deleteMarkerMaxAge = 1000;
const dbVersion = 1;
const dbStoreName = 'objects';
const { silent } = utils.queryParams as { silent?: boolean };
const resetApp = localStorage.getItem('resetStackEdit');
if (resetApp) {
  localStorage.removeItem('resetStackEdit');
}

class Connection {
  dbName: string;
  db?: IDBDatabase;
  getTxCbs: TxCb[] | null;

  constructor(workspaceId: string = useWorkspaceStore().currentWorkspace.id) {
    this.getTxCbs = [];

    // Make the DB name
    this.dbName = utils.getDbName(workspaceId);

    // Init connection
    const request = indexedDB.open(this.dbName, dbVersion);

    request.onerror = () => {
      throw new Error("Can't connect to IndexedDB.");
    };

    request.onsuccess = (event: Event) => {
      this.db = (event.target as IDBOpenDBRequest).result;
      this.db.onversionchange = () => window.location.reload();

      this.getTxCbs?.forEach(({ onTx, onError }) => this.createTx(onTx, onError));
      this.getTxCbs = null;
    };

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const eventDb = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion || 0;

      // We don't use 'break' in this switch statement,
      // the fall-through behavior is what we want.
      /* eslint-disable no-fallthrough */
      switch (oldVersion) {
        case 0: {
          // Create store
          const dbStore = eventDb.createObjectStore(dbStoreName, {
            keyPath: 'id',
          });
          dbStore.createIndex('tx', 'tx', {
            unique: false,
          });
        }
        default:
      }
      /* eslint-enable no-fallthrough */
    };
  }

  /**
   * Create a transaction asynchronously.
   */
  createTx(onTx: (tx: IDBTransaction) => void, onError: () => void): unknown {
    // If DB is not ready, keep callbacks for later
    if (!this.db) {
      return this.getTxCbs?.push({ onTx, onError });
    }

    // Open transaction in read/write will prevent conflict with other tabs
    const tx = this.db.transaction(this.db.objectStoreNames, 'readwrite');
    tx.onerror = onError;

    return onTx(tx);
  }
}

const contentTypes: Record<string, true> = {
  content: true,
  contentState: true,
  syncedContent: true,
};

const hashMap: Record<string, Record<string, number>> = {};
(constants as any).types.forEach((type: string) => {
  hashMap[type] = Object.create(null);
});
const lsHashMap: Record<string, number> = Object.create(null);

interface LocalDbSvc {
  lastTx: number;
  hashMap: Record<string, Record<string, number>>;
  connection: Connection | null;
  loadSyncedContent: (fileId: string) => Promise<DbItem | undefined>;
  loadContentState: (fileId: string) => Promise<DbItem | undefined>;
  syncLocalStorage(): void;
  sync(): Promise<void>;
  readAll(tx: IDBTransaction, cb: (storeItemMap: StoreItemMap) => void): void;
  writeAll(storeItemMap: StoreItemMap, tx: IDBTransaction): void;
  readDbItem(dbItem: DbItem, storeItemMap: StoreItemMap): void;
  loadItem(id: string): Promise<DbItem>;
  unloadContents(): Promise<void>;
  init(): Promise<void>;
  getWorkspaceItems(
    workspaceId: string,
    onItem: (item: DbItem) => void,
    onFinish?: () => void,
  ): () => void;
}

const localDbSvc: LocalDbSvc = {
  lastTx: 0,
  hashMap,
  connection: null,

  // Loaders are attached after the object literal so they can reference `this`.
  loadSyncedContent: undefined as unknown as (fileId: string) => Promise<DbItem | undefined>,
  loadContentState: undefined as unknown as (fileId: string) => Promise<DbItem | undefined>,

  /**
   * Sync data items stored in the localStorage.
   */
  syncLocalStorage(): void {
    (constants as any).localStorageDataIds.forEach((id: string) => {
      const key = `data/${id}`;

      // Skip reloading the layoutSettings
      if (id !== 'layoutSettings' || !lsHashMap[id]) {
        try {
          // Try to parse the item from the localStorage
          const storedItem = JSON.parse(localStorage.getItem(key) || 'null');
          if (storedItem && storedItem.hash && lsHashMap[id] !== storedItem.hash) {
            // Item has changed, replace it in the store
            useDataStore().setItem(storedItem);
            lsHashMap[id] = storedItem.hash;
          }
        } catch {
          // Ignore parsing issue
        }
      }

      // Write item if different from stored one
      const item = (useDataStore().lsItemsById as Record<string, any>)[id];
      if (item && item.hash !== lsHashMap[id]) {
        localStorage.setItem(key, JSON.stringify(item));
        lsHashMap[id] = item.hash;
      }
    });
  },

  /**
   * Return a promise that will be resolved once the synchronization between the store and the
   * localDb will be finished. Effectively, open a transaction, then read and apply all changes
   * from the DB since the previous transaction, then write all the changes from the store.
   */
  async sync(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Create the DB transaction
      this.connection?.createTx((tx) => {
        const { lastTx } = this;

        // Look for DB changes and apply them to the store
        this.readAll(tx, (storeItemMap) => {
          // Sanitize the workspace if changes have been applied
          if (lastTx !== this.lastTx) {
            workspaceSvc.sanitizeWorkspace();
          }

          // Persist all the store changes into the DB
          this.writeAll(storeItemMap, tx);
          // Sync the localStorage
          this.syncLocalStorage();
          // Done
          resolve();
        });
      }, () => reject(new Error('Local DB access error.')));
    });
  },

  /**
   * Read and apply all changes from the DB since previous transaction.
   */
  readAll(tx: IDBTransaction, cb: (storeItemMap: StoreItemMap) => void): void {
    let { lastTx } = this;
    const dbStore = tx.objectStore(dbStoreName);
    const index = dbStore.index('tx');
    const range = IDBKeyRange.lowerBound(this.lastTx, true);
    const changes: DbItem[] = [];
    index.openCursor(range).onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const item = cursor.value as DbItem;
        if ((item.tx as number) > lastTx) {
          lastTx = item.tx as number;
          if (this.lastTx && (item.tx as number) - this.lastTx > deleteMarkerMaxAge) {
            // We may have missed some delete markers
            window.location.reload();
            return;
          }
        }
        // Collect change
        changes.push(item);
        cursor.continue();
        return;
      }

      // Read the collected changes
      const storeItemMap: StoreItemMap = { ...store.getters.allItemsById };
      changes.forEach((item) => {
        this.readDbItem(item, storeItemMap);
        // If item is an old delete marker, remove it from the DB
        if (!item.hash && lastTx - (item.tx as number) > deleteMarkerMaxAge) {
          dbStore.delete(item.id);
        }
      });

      this.lastTx = lastTx;
      cb(storeItemMap);
    };
  },

  /**
   * Write all changes from the store since previous transaction.
   */
  writeAll(storeItemMap: StoreItemMap, tx: IDBTransaction): void {
    if (silent) {
      // Skip writing to DB in silent mode
      return;
    }
    const dbStore = tx.objectStore(dbStoreName);
    const incrementedTx = this.lastTx + 1;

    // Remove deleted store items
    Object.keys(this.hashMap).forEach((type) => {
      // Remove this type only if file is deleted
      let checker: (cb: (id: string) => void) => (id: string) => void = cb => id => {
        if (!storeItemMap[id]) cb(id);
      };
      if (contentTypes[type]) {
        // For content types, remove item only if file is deleted
        checker = cb => (id) => {
          if (!storeItemMap[id]) {
            const [fileId] = id.split('/');
            if (!(useFileStore().itemsById as Record<string, any>)[fileId]) {
              cb(id);
            }
          }
        };
      }
      Object.keys(this.hashMap[type]).forEach(checker((id) => {
        // Put a delete marker to notify other tabs
        dbStore.put({
          id,
          type,
          tx: incrementedTx,
        });
        delete this.hashMap[type][id];
        this.lastTx = incrementedTx;
      }));
    });

    // Put changes
    Object.entries(storeItemMap).forEach(([, storeItem]) => {
      // Store object has changed
      if (this.hashMap[storeItem.type][storeItem.id] !== storeItem.hash) {
        const item: DbItem = {
          ...storeItem,
          tx: incrementedTx,
        };
        dbStore.put(item);
        this.hashMap[item.type][item.id] = item.hash as number;
        this.lastTx = incrementedTx;
      }
    });
  },

  /**
   * Read and apply one DB change.
   */
  readDbItem(dbItem: DbItem, storeItemMap: StoreItemMap): void {
    const storeItem = storeItemMap[dbItem.id];
    if (!dbItem.hash) {
      // DB item is a delete marker
      delete this.hashMap[dbItem.type][dbItem.id];
      if (storeItem) {
        // Remove item from the store
        deleteItemByType(storeItem.type, storeItem.id);
        delete storeItemMap[storeItem.id];
      }
    } else if (this.hashMap[dbItem.type][dbItem.id] !== dbItem.hash) {
      // DB item is different from the corresponding store item
      this.hashMap[dbItem.type][dbItem.id] = dbItem.hash;
      // Update content only if it exists in the store
      if (storeItem || !contentTypes[dbItem.type]) {
        // Put item in the store
        dbItem.tx = undefined;
        setItemByType(dbItem.type, dbItem);
        storeItemMap[dbItem.id] = dbItem;
      }
    }
  },

  /**
   * Retrieve an item from the DB and put it in the store.
   */
  async loadItem(id: string): Promise<DbItem> {
    // Check if item is in the store
    const itemInStore: DbItem | undefined = store.getters.allItemsById[id];
    if (itemInStore) {
      // Use deepCopy to freeze item
      return Promise.resolve(itemInStore);
    }
    return new Promise<DbItem>((resolve, reject) => {
      // Get the item from DB
      const onError = () => reject(new Error('Data not available.'));
      this.connection?.createTx((tx) => {
        const dbStore = tx.objectStore(dbStoreName);
        const request = dbStore.get(id);
        request.onsuccess = () => {
          const dbItem = request.result as DbItem | undefined;
          if (!dbItem || !dbItem.hash) {
            onError();
          } else {
            this.hashMap[dbItem.type][dbItem.id] = dbItem.hash;
            // Put item in the store
            dbItem.tx = undefined;
            setItemByType(dbItem.type, dbItem);
            resolve(dbItem);
          }
        };
      }, () => onError());
    });
  },

  /**
   * Unload from the store contents that haven't been opened recently
   */
  async unloadContents(): Promise<void> {
    await this.sync();
    // Keep only last opened files in memory
    const lastOpenedFileIdSet = new Set<string>(useDataStore().lastOpenedIds);
    Object.keys(contentTypes).forEach((type) => {
      (store.getters[`${type}/items`] as DbItem[]).forEach((item) => {
        const [fileId] = item.id.split('/');
        if (!lastOpenedFileIdSet.has(fileId)) {
          // Remove item from the store
          deleteItemByType(type, item.id);
        }
      });
    });
  },

  /**
   * Create the connection and start syncing.
   */
  async init(): Promise<void> {
    // Reset the app if the reset flag was passed
    if (resetApp) {
      await Promise.all(Object.keys(useWorkspaceStore().workspacesById)
        .map((workspaceId: string) => workspaceSvc.removeWorkspace(workspaceId)));
      (constants as any).localStorageDataIds.forEach((id: string) => {
        // Clean data stored in localStorage
        localStorage.removeItem(`data/${id}`);
      });
      throw new Error('RELOAD');
    }

    // Create the connection
    this.connection = new Connection();

    // Load the DB
    await localDbSvc.sync();

    // Watch workspace deletions and persist them as soon as possible
    // to make the changes available to reloading workspace tabs.
    store.watch(
      () => useDataStore().workspaces,
      () => this.syncLocalStorage(),
    );

    // Save welcome file content hash if not done already
    const hash = utils.hash(welcomeFile);
    const { welcomeFileHashes } = useDataStore().localSettings;
    if (!welcomeFileHashes[hash]) {
      useDataStore().patchLocalSettings({
        welcomeFileHashes: {
          ...welcomeFileHashes,
          [hash]: 1,
        },
      });
    }

    // If app was last opened 7 days ago and synchronization is off
    if (!useWorkspaceStore().syncToken
      && (useWorkspaceStore().lastFocus + (constants as any).cleanTrashAfter < Date.now())
    ) {
      // Clean files
      (useFileStore().items as Array<{ id: string; parentId: string }>)
        .filter(file => file.parentId === 'trash') // If file is in the trash
        .forEach(file => workspaceSvc.deleteFile(file.id));
    }

    // Sync local DB periodically
    utils.setInterval(() => localDbSvc.sync(), 1000);

    // watch current file changing
    let prevCurrentId: string | null = useFileStore().current.id || null;
    store.watch(
      () => useFileStore().current.id,
      async (newId: string | null | undefined) => {
        // If the file we're leaving was a brand-new draft the user never
        // edited, discard it so the workspace doesn't fill up with empty
        // "Untitled" stubs. Resolved lazily here because the `draftFilesSvc`
        // import at top level would be a circular dep risk.
        if (prevCurrentId && prevCurrentId !== newId) {
          draftFilesSvc.discardIfUnedited(prevCurrentId);
        }
        prevCurrentId = newId || null;
        // See if currentFile is real, ie it has an ID
        const currentFile = useFileStore().current;
        // If current file has no ID, get the most recent file
        if (!currentFile.id) {
          if (useExplorerStore().userClosedFile) {
            // User deliberately closed — don't auto-recover.
            return;
          }
          const recentFile = useFileStore().lastOpened;
          // Set it as the current file
          if (recentFile.id) {
            useFileStore().setCurrentId(recentFile.id);
          } else if (!(useFileStore().items as unknown[]).length) {
            // Truly empty workspace (first boot) — bootstrap a welcome file.
            // If the only remaining items are in Trash, leave currentId
            // null so the explorer empty-state shows instead of resurrecting
            // a trashed file and auto-expanding its folder.
            const newFile = await workspaceSvc.createFile({
              name: 'Welcome file',
              text: welcomeFile,
            }, true);
            // Set it as the current file
            useFileStore().setCurrentId(newFile.id);
          }
        } else {
          if (useExplorerStore().userClosedFile) {
            // Any transition to a real file clears the close flag.
            useExplorerStore().setUserClosedFile(false);
          }
          try {
            // Load contentState from DB
            await localDbSvc.loadContentState(currentFile.id);
            // Load syncedContent from DB
            await localDbSvc.loadSyncedContent(currentFile.id);
            // Load content from DB
            try {
              await localDbSvc.loadItem(`${currentFile.id}/content`);
            } catch (err) {
              // Failure (content is not available), go back to previous file
              const lastOpenedFile = useFileStore().lastOpened;
              useFileStore().setCurrentId(lastOpenedFile.id);
              throw err;
            }
            // Set last opened file
            useDataStore().setLastOpenedId(currentFile.id);
            // Cancel new discussion and open the gutter if file contains discussions
            useDiscussionStore().setCurrentDiscussionId(
              useDiscussionStore().nextDiscussionId,
            );
          } catch (err) {
            console.error(err);
            useNotificationStore().error(err);
          }
        }
      },
      { immediate: true },
    );
  },

  getWorkspaceItems(
    workspaceId: string,
    onItem: (item: DbItem) => void,
    onFinish: () => void = () => {},
  ): () => void {
    const connection = new Connection(workspaceId);
    connection.createTx((tx) => {
      const dbStore = tx.objectStore(dbStoreName);
      const index = dbStore.index('tx');
      index.openCursor().onsuccess = (event: Event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          onItem(cursor.value as DbItem);
          cursor.continue();
        } else {
          connection.db?.close();
          onFinish();
        }
      };
    }, () => {});

    // Return a cancel function
    return () => connection.db?.close();
  },
};

const loader = (type: string) => (fileId: string) => localDbSvc.loadItem(`${fileId}/${type}`)
  // Item does not exist, create it
  .catch(() => {
    setItemByType(type, {
      id: `${fileId}/${type}`,
    });
    return undefined;
  });
localDbSvc.loadSyncedContent = loader('syncedContent');
localDbSvc.loadContentState = loader('contentState');

export default localDbSvc;
