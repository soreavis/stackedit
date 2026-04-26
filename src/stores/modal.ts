import { defineStore } from 'pinia';

export interface ModalConfig {
  type: string;
  callback?: (...args: unknown[]) => void;
  resolve?: (value?: unknown) => void;
  reject?: (reason?: unknown) => void;
  // Modal-specific fields (initialQuery, scope, lines, etc.) — open
  // ended so each modal type can attach what it needs.
  [k: string]: unknown;
}

interface ModalState {
  stack: ModalConfig[];
  hidden: boolean;
}

export const useModalStore = defineStore('modal', {
  state: (): ModalState => ({
    stack: [],
    hidden: false,
  }),
  getters: {
    config: ({ hidden, stack }: ModalState): ModalConfig | false => (!hidden && stack[0]) || false,
  },
  actions: {
    async open(param: string | ModalConfig): Promise<unknown> {
      const config: ModalConfig = typeof param === 'object' ? { ...param } : { type: param };
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
    async hideUntil<T>(promise: Promise<T>): Promise<T> {
      try {
        this.hidden = true;
        return await promise;
      } finally {
        this.hidden = false;
      }
    },
  },
});
