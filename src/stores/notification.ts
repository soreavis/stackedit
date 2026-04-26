import { defineStore } from 'pinia';
import providerRegistry from '../services/providers/common/providerRegistry';
import utils from '../services/utils';
import { useQueueStore } from './queue';

const defaultTimeout = 5000; // 5 sec

export type NotificationType = 'info' | 'badge' | 'confirm' | 'error';

export interface NotificationItem {
  type: NotificationType;
  content?: string;
  timeout?: number;
  promise?: Promise<unknown>;
  resolve?: (value?: unknown) => void;
  reject?: (reason?: unknown) => void;
}

interface NotificationState {
  items: NotificationItem[];
}

interface ErrorLike {
  message?: string;
  status?: number | string;
}

export const useNotificationStore = defineStore('notification', {
  state: (): NotificationState => ({
    items: [],
  }),
  actions: {
    showItem(item: NotificationItem): Promise<unknown> {
      const existingItem = (utils as { someResult: <T, R>(arr: T[], pred: (x: T) => R | false) => R | undefined }).someResult(
        this.items,
        (other: NotificationItem) => (
          other.type === item.type && other.content === item.content ? other : false
        ),
      );
      if (existingItem) {
        return existingItem.promise as Promise<unknown>;
      }

      item.promise = new Promise<unknown>((resolve, reject) => {
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
    info(content: string) {
      return this.showItem({ type: 'info', content });
    },
    badge(content: string) {
      return this.showItem({ type: 'badge', content });
    },
    confirm(content: string) {
      return this.showItem({
        type: 'confirm',
        content,
        timeout: 10000, // 10 sec
      });
    },
    error(error: ErrorLike | string | unknown) {
      const item: NotificationItem = { type: 'error' };
      if (error) {
        const e = error as ErrorLike;
        if (e.message) {
          item.content = e.message;
        } else if (e.status !== undefined) {
          const location = useQueueStore().currentLocation as { providerId?: string };
          if (location.providerId) {
            const provider = (providerRegistry as { providersById: Record<string, { name: string }> }).providersById[location.providerId];
            item.content = `HTTP error ${e.status} on ${provider.name} location.`;
          } else {
            item.content = `HTTP error ${e.status}.`;
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
