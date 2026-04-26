import { defineStore } from 'pinia';

export interface UserInfo {
  id: string;
  name?: string;
  imageUrl?: string;
}

interface UserInfoState {
  itemsById: Record<string, UserInfo>;
}

// userInfo doesn't use moduleTemplate because its setItem preserves
// existing `name` / `imageUrl` fields when partial info comes in (e.g.
// a discussion reply gives the user id but no avatar).
export const useUserInfoStore = defineStore('userInfo', {
  state: (): UserInfoState => ({
    itemsById: {},
  }),
  actions: {
    setItem(item: UserInfo): void {
      const itemToSet: UserInfo = { ...item };
      const existingItem = this.itemsById[item.id];
      if (existingItem) {
        if (!itemToSet.name) {
          itemToSet.name = existingItem.name;
        }
        if (!itemToSet.imageUrl) {
          itemToSet.imageUrl = existingItem.imageUrl;
        }
      }
      this.itemsById = { ...this.itemsById, [item.id]: itemToSet };
    },
  },
});
