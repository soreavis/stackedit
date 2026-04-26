import { defineStore } from 'pinia';

export type FindReplaceType = 'find' | 'replace' | null;

interface FindReplaceState {
  type: FindReplaceType;
  lastOpen: number;
  findText: string;
  replaceText: string;
}

export const useFindReplaceStore = defineStore('findReplace', {
  state: (): FindReplaceState => ({
    type: null,
    lastOpen: 0,
    findText: '',
    replaceText: '',
  }),
  actions: {
    setType(value: FindReplaceType) {
      this.type = value;
    },
    setLastOpen() {
      this.lastOpen = Date.now();
    },
    setFindText(value: string) {
      this.findText = value;
    },
    setReplaceText(value: string) {
      this.replaceText = value;
    },
    open({ type, findText }: { type: FindReplaceType; findText?: string }) {
      this.setType(type);
      if (findText) this.setFindText(findText);
      this.setLastOpen();
    },
  },
});
