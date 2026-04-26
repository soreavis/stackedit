import store from '../store';
import { useNotificationStore } from '../stores/notification';
import { useDataStore } from '../stores/data';

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
  const earnedBadges: Badge[] = (useDataStore().allBadges as Badge[])
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
    if (!useDataStore().badgeCreations[featureId]) {
      if (!lastEarnedFeatureIds) {
        const earnedFeatureIds: string[] = (useDataStore().allBadges as Badge[])
          .filter(badge => badge.isEarned)
          .map(badge => badge.featureId);
        lastEarnedFeatureIds = new Set(earnedFeatureIds);
      }

      useDataStore().patchBadgeCreations({
        [featureId]: {
          created: Date.now(),
        },
      });

      clearTimeout(debounceTimeoutId);
      debounceTimeoutId = setTimeout(() => showInfo(), 5000);
    }
  },
};
