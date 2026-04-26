import store from '../store';
import { useWorkspaceStore } from '../stores/workspace';
import { useUserInfoStore } from '../stores/userInfo';
import utils from './utils';
import { useDataStore } from '../stores/data';

const refreshUserInfoAfter = 60 * 60 * 1000; // 60 minutes

interface UserInfo {
  id: string;
  name?: string;
  imageUrl?: string;
}

type InfoResolver = (sub: string) => Promise<UserInfo>;

const infoResolversByType: Record<string, InfoResolver> = {};
const subPrefixesByType: Record<string, string> = {};
const typesBySubPrefix: Record<string, string> = {};

const lastInfosByUserId: Record<string, number> = {};
const infoPromisedByUserId: Record<string, boolean> = {};

const sanitizeUserId = (userId: string): string => {
  const prefix = userId[2] === ':' ? userId.slice(0, 2) : '';
  if (typesBySubPrefix[prefix]) {
    return userId;
  }
  return `go:${userId}`;
};

const parseUserId = (userId: string): [string, string] => [
  typesBySubPrefix[userId.slice(0, 2)],
  userId.slice(3),
];

const refreshUserInfos = (): void => {
  if (store.state.offline) {
    return;
  }

  Object.entries(lastInfosByUserId)
    .filter(([userId, lastInfo]) => lastInfo === 0 && !infoPromisedByUserId[userId])
    .forEach(async ([userId]) => {
      const [type, sub] = parseUserId(userId);
      const infoResolver = infoResolversByType[type];
      if (infoResolver) {
        try {
          infoPromisedByUserId[userId] = true;
          const userInfo = await infoResolver(sub);
          useUserInfoStore().setItem(userInfo);
        } finally {
          infoPromisedByUserId[userId] = false;
          lastInfosByUserId[userId] = Date.now();
        }
      }
    });
};

export default {
  setInfoResolver(type: string, subPrefix: string, resolver: InfoResolver): void {
    infoResolversByType[type] = resolver;
    subPrefixesByType[type] = subPrefix;
    typesBySubPrefix[subPrefix] = type;
  },
  getCurrentUserId(): string | null {
    const loginToken = useWorkspaceStore().loginToken;
    if (!loginToken) {
      return null;
    }
    const loginType = useWorkspaceStore().loginType;
    const prefix = subPrefixesByType[loginType];
    return prefix ? `${prefix}:${loginToken.sub}` : loginToken.sub;
  },
  sanitizeUserId,
  addUserInfo(userInfo: UserInfo): void {
    useUserInfoStore().setItem(userInfo);
    lastInfosByUserId[userInfo.id] = Date.now();
  },
  addUserId(userId: string | null | undefined): void {
    if (!userId) return;
    const sanitizedUserId = sanitizeUserId(userId);
    const lastInfo = lastInfosByUserId[sanitizedUserId];
    if (lastInfo === undefined) {
      // Try to find a token with this sub to resolve name as soon as possible
      const [type, sub] = parseUserId(sanitizedUserId);
      const token = useDataStore().tokensByType[type]?.[sub];
      if (token) {
        useUserInfoStore().setItem({
          id: sanitizedUserId,
          name: token.name,
        });
      }
    }

    if (lastInfo === undefined || lastInfo + refreshUserInfoAfter < Date.now()) {
      lastInfosByUserId[sanitizedUserId] = 0;
      refreshUserInfos();
    }
  },
};

// Get user info periodically
utils.setInterval(() => refreshUserInfos(), 60 * 1000);
