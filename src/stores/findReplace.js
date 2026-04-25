import { defineStore } from 'pinia';

export const useFindReplaceStore = defineStore('findReplace', {
  state: () => ({
    type: null,
    lastOpen: 0,
    findText: '',
    replaceText: '',
  }),
  actions: {
    setType(value) {
      this.type = value;
    },
    setLastOpen() {
      this.lastOpen = Date.now();
    },
    setFindText(value) {
      this.findText = value;
    },
    setReplaceText(value) {
      this.replaceText = value;
    },
    open({ type, findText }) {
      this.setType(type);
      if (findText) this.setFindText(findText);
      this.setLastOpen();
    },
  },
});
