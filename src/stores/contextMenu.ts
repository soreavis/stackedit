import { defineStore } from 'pinia';
import { useLayoutStore } from './layout';

export interface ContextMenuItem {
  name: string;
  perform?: () => void;
  // Other ad-hoc fields callers attach (icon, separator, ...).
  [k: string]: unknown;
}

interface ContextMenuState {
  coordinates: { left: number; top: number };
  items: ContextMenuItem[];
  resolve: (item?: ContextMenuItem) => void;
}

export const useContextMenuStore = defineStore('contextMenu', {
  state: (): ContextMenuState => ({
    coordinates: { left: 0, top: 0 },
    items: [],
    resolve: () => {},
  }),
  actions: {
    open({ coordinates, items }: { coordinates: { left: number; top: number }; items: ContextMenuItem[] }): Promise<ContextMenuItem | undefined> {
      this.items = items;
      // Place the context menu offscreen first so we can measure it
      this.coordinates = { top: 0, left: -9999 };
      // Let the UI refresh itself
      setTimeout(() => {
        const elt = document.querySelector('.context-menu__inner') as HTMLElement | null;
        if (elt) {
          const height = elt.offsetHeight;
          const { bodyHeight, bodyWidth } = useLayoutStore() as unknown as { bodyHeight: number; bodyWidth: number };
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

      return new Promise<ContextMenuItem | undefined>((resolve) => {
        this.resolve = resolve as (item?: ContextMenuItem) => void;
      });
    },
    close() {
      this.items = [];
      this.resolve = () => {};
    },
  },
});
