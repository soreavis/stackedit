import store from '../store';
import { useNotificationStore } from '../stores/notification';

interface Badge {
  isEarned: boolean;
  featureId: string;
  name: string;
}

let lastEarnedFeatureIds: Set<string> | null = null;
let debounceTimeoutId: ReturnType<typeof setTimeout> | undefined;

const showInfo = (): void => {
  if (!lastEarnedFeatureIds) return;
  const previouslyEarned = lastEarnedFeatureIds;
  const earnedBadges: Badge[] = (store.getters['data/allBadges'] as Badge[])
    .filter(badge => badge.isEarned && !previouslyEarned.has(badge.featureId));
  if (earnedBadges.length) {
    useNotificationStore().badge(earnedBadges.length > 1
      ? `You've earned ${earnedBadges.length} badges: ${earnedBadges.map(badge => `"${badge.name}"`).join(', ')}.`
      : `You've earned 1 badge: "${earnedBadges[0].name}".`);
  }
  lastEarnedFeatureIds = null;
};

export default {
  addBadge(featureId: string): void {
    if (!store.getters['data/badgeCreations'][featureId]) {
      if (!lastEarnedFeatureIds) {
        const earnedFeatureIds: string[] = (store.getters['data/allBadges'] as Badge[])
          .filter(badge => badge.isEarned)
          .map(badge => badge.featureId);
        lastEarnedFeatureIds = new Set(earnedFeatureIds);
      }

      store.dispatch('data/patchBadgeCreations', {
        [featureId]: {
          created: Date.now(),
        },
      });

      clearTimeout(debounceTimeoutId);
      debounceTimeoutId = setTimeout(() => showInfo(), 5000);
    }
  },
};
