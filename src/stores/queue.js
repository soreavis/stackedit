import { defineStore } from 'pinia';
import store from '../store';
import { useNotificationStore } from './notification';

let queue = Promise.resolve();

export const useQueueStore = defineStore('queue', {
  state: () => ({
    isEmpty: true,
    isSyncRequested: false,
    isPublishRequested: false,
    currentLocation: {},
  }),
  actions: {
    enqueue(cb) {
      // Vuex root state still owns the offline flag during the transition.
      if (store.state.offline) {
        return;
      }
      const checkOffline = () => {
        if (store.state.offline) {
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
            // notification module still lives in Vuex during the transition.
            useNotificationStore().error(err);
          })
          .then(() => {
            if (newQueue === queue) {
              this.isEmpty = true;
            }
          }));
      queue = newQueue;
    },
    enqueueSyncRequest(cb) {
      if (!this.isSyncRequested) {
        this.isSyncRequested = true;
        const unset = () => {
          this.isSyncRequested = false;
        };
        this.enqueue(() => cb().then(unset, (err) => {
          unset();
          throw err;
        }));
      }
    },
    enqueuePublishRequest(cb) {
      if (!this.isSyncRequested) {
        this.isPublishRequested = true;
        const unset = () => {
          this.isPublishRequested = false;
        };
        this.enqueue(() => cb().then(unset, (err) => {
          unset();
          throw err;
        }));
      }
    },
    async doWithLocation({ location, action }) {
      try {
        this.currentLocation = location;
        return await action();
      } finally {
        this.currentLocation = {};
      }
    },
  },
});
