import { defineStore } from 'pinia';
import providerRegistry from '../services/providers/common/providerRegistry';
import utils from '../services/utils';
import { useQueueStore } from './queue';

const defaultTimeout = 5000; // 5 sec

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    items: [],
  }),
  actions: {
    showItem(item) {
      const existingItem = utils.someResult(
        this.items,
        other => other.type === item.type && other.content === item.content && item,
      );
      if (existingItem) {
        return existingItem.promise;
      }

      item.promise = new Promise((resolve, reject) => {
        this.items = [...this.items, item];
        const removeItem = () => {
          this.items = this.items.filter(otherItem => otherItem !== item);
        };
        setTimeout(removeItem, item.timeout || defaultTimeout);
        item.resolve = (res) => {
          removeItem();
          resolve(res);
        };
        item.reject = (err) => {
          removeItem();
          reject(err);
        };
      });

      return item.promise;
    },
    info(content) {
      return this.showItem({ type: 'info', content });
    },
    badge(content) {
      return this.showItem({ type: 'badge', content });
    },
    confirm(content) {
      return this.showItem({
        type: 'confirm',
        content,
        timeout: 10000, // 10 sec
      });
    },
    error(error) {
      const item = { type: 'error' };
      if (error) {
        if (error.message) {
          item.content = error.message;
        } else if (error.status) {
          const location = useQueueStore().currentLocation;
          if (location.providerId) {
            const provider = providerRegistry.providersById[location.providerId];
            item.content = `HTTP error ${error.status} on ${provider.name} location.`;
          } else {
            item.content = `HTTP error ${error.status}.`;
          }
        } else {
          item.content = `${error}`;
        }
      }
      if (!item.content || item.content === '[object Object]') {
        item.content = 'Unknown error.';
      }
      return this.showItem(item);
    },
  },
});
