import { defineStore } from 'pinia';
import { useLayoutStore } from './layout';

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
          const { bodyHeight, bodyWidth } = useLayoutStore();
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
