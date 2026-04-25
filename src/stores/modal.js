import { defineStore } from 'pinia';

export const useModalStore = defineStore('modal', {
  state: () => ({
    stack: [],
    hidden: false,
  }),
  getters: {
    config: ({ hidden, stack }) => !hidden && stack[0],
  },
  actions: {
    async open(param) {
      const config = typeof param === 'object' ? { ...param } : { type: param };
      try {
        return await new Promise((resolve, reject) => {
          config.resolve = resolve;
          config.reject = reject;
          this.stack = [config, ...this.stack];
        });
      } finally {
        this.stack = this.stack.filter(otherConfig => otherConfig !== config);
      }
    },
    async hideUntil(promise) {
      try {
        this.hidden = true;
        return await promise;
      } finally {
        this.hidden = false;
      }
    },
  },
});
