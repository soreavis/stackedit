const origin = `${window.location.protocol}//${window.location.host}`;

interface Constants {
  cleanTrashAfter: number;
  origin: string;
  oauth2RedirectUri: string;
  types: string[];
  localStorageDataIds: string[];
  textMaxLength: number;
  defaultName: string;
}

const constants: Constants = {
  cleanTrashAfter: 7 * 24 * 60 * 60 * 1000, // 7 days
  origin,
  oauth2RedirectUri: `${origin}/oauth2/callback`,
  types: [
    'contentState',
    'syncedContent',
    'content',
    'file',
    'folder',
    'syncLocation',
    'publishLocation',
    'data',
  ],
  localStorageDataIds: [
    'workspaces',
    'settings',
    'layoutSettings',
    'localSettings',
    'tokens',
    'badgeCreations',
    'serverConf',
  ],
  textMaxLength: 250000,
  defaultName: 'Untitled',
};

export default constants;
