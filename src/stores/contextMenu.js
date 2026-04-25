import { defineStore } from 'pinia';
import store from '../store';

export const useContextMenuStore = defineStore('contextMenu', {
  state: () => ({
    coordinates: { left: 0, top: 0 },
    items: [],
    resolve: () => {},
  }),
  actions: {
    open({ coordinates, items }) {
      this.items = items;
      // Place the context menu offscreen first so we can measure it
      this.coordinates = { top: 0, left: -9999 };
      // Let the UI refresh itself
      setTimeout(() => {
        const elt = document.querySelector('.context-menu__inner');
        if (elt) {
          const height = elt.offsetHeight;
          // layout module still lives in Vuex during the transition.
          const { bodyHeight, bodyWidth } = store.state.layout;
          if (coordinates.top + height > bodyHeight) {
            coordinates.top -= height;
          }
          if (coordinates.top < 0) {
            coordinates.top = 0;
          }
          const width = elt.offsetWidth;
          if (coordinates.left + width > bodyWidth) {
            coordinates.left -= width;
          }
          if (coordinates.left < 0) {
            coordinates.left = 0;
          }
          this.coordinates = coordinates;
        }
      }, 1);

      return new Promise((resolve) => {
        this.resolve = resolve;
      });
    },
    close() {
      this.items = [];
      this.resolve = () => {};
    },
  },
});
