import { defineStore } from 'pinia';
import { useNotificationStore } from './notification';
import { useGlobalStore } from './global';

interface QueueState {
  isEmpty: boolean;
  isSyncRequested: boolean;
  isPublishRequested: boolean;
  currentLocation: Record<string, unknown>;
}

let queue: Promise<unknown> = Promise.resolve();

export const useQueueStore = defineStore('queue', {
  state: (): QueueState => ({
    isEmpty: true,
    isSyncRequested: false,
    isPublishRequested: false,
    currentLocation: {},
  }),
  actions: {
    enqueue(cb: () => Promise<unknown> | unknown): void {
      if (useGlobalStore().offline) {
        return;
      }
      const checkOffline = () => {
        if (useGlobalStore().offline) {
          // Empty the queue
          queue = Promise.resolve();
          this.isEmpty = true;
          throw new Error('offline');
        }
      };
      if (this.isEmpty) {
        this.isEmpty = false;
      }
      const newQueue = queue
        .then(() => checkOffline())
        .then(() => Promise.resolve()
          .then(() => cb())
          .catch((err) => {
            console.error(err);
            checkOffline();
            useNotificationStore().error(err);
          })
          .then(() => {
            if (newQueue === queue) {
              this.isEmpty = true;
            }
          }));
      queue = newQueue;
    },
    enqueueSyncRequest(cb: () => Promise<unknown>): void {
      if (!this.isSyncRequested) {
        this.isSyncRequested = true;
        const unset = () => {
          this.isSyncRequested = false;
        };
        this.enqueue(() => cb().then(unset, (err: unknown) => {
          unset();
          throw err;
        }));
      }
    },
    enqueuePublishRequest(cb: () => Promise<unknown>): void {
      if (!this.isSyncRequested) {
        this.isPublishRequested = true;
        const unset = () => {
          this.isPublishRequested = false;
        };
        this.enqueue(() => cb().then(unset, (err: unknown) => {
          unset();
          throw err;
        }));
      }
    },
    async doWithLocation<T>({ location, action }: { location: Record<string, unknown>; action: () => Promise<T> | T }): Promise<T> {
      try {
        this.currentLocation = location;
        return await action();
      } finally {
        this.currentLocation = {};
      }
    },
  },
});
