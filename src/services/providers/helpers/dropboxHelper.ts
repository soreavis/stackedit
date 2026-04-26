// HTTP / OAuth plumbing for Dropbox. Method params + response payloads
// kept loose (`any`) — vendor APIs return dynamic shapes.
import networkSvc from '../../networkSvc';
import userSvc from '../../userSvc';
import badgeSvc from '../../badgeSvc';
import { useDataStore } from '../../../stores/data';

const getAppKey = (fullAccess: any): any => {
  if (fullAccess) {
    return (useDataStore().serverConf as any).dropboxAppKeyFull;
  }
  return (useDataStore().serverConf as any).dropboxAppKey;
};

const httpHeaderSafeJson = (args: any): any => args && JSON.stringify(args)
  .replace(/[\u007f-\uffff]/g, c => `\\u${`000${c.charCodeAt(0).toString(16)}`.slice(-4)}`);

const request = ({ accessToken }: any, options: any, args?: any): Promise<any> => (networkSvc as any).request({
  ...options,
  headers: {
    ...options.headers || {},
    'Content-Type': options.body && (typeof options.body === 'string'
      ? 'application/octet-stream' : 'application/json; charset=utf-8'),
    'Dropbox-API-Arg': httpHeaderSafeJson(args),
    Authorization: `Bearer ${accessToken}`,
  },
});

/**
 * https://www.dropbox.com/developers/documentation/http/documentation#users-get_account
 */
const subPrefix = 'db';
(userSvc as any).setInfoResolver('dropbox', subPrefix, async (sub: any) => {
  const dropboxToken: any = Object.values(useDataStore().dropboxTokensBySub)[0];
  try {
    const { body } = await request(dropboxToken, {
      method: 'POST',
      url: 'https://api.dropboxapi.com/2/users/get_account',
      body: {
        account_id: sub,
      },
    });

    return {
      id: `${subPrefix}:${body.account_id}`,
      name: body.name.display_name,
      imageUrl: body.profile_photo_url || '',
    };
  } catch (err: any) {
    if (!dropboxToken || err.status !== 404) {
      throw new Error('RETRY');
    }
    throw err;
  }
});

export default {
  subPrefix,

  /**
   * https://www.dropbox.com/developers/documentation/http/documentation#oauth2-authorize
   * https://www.dropbox.com/developers/documentation/http/documentation#users-get_current_account
   */
  async startOauth2(fullAccess: any, sub: any = null, silent: boolean = false): Promise<any> {
    // Get an OAuth2 code
    const { accessToken } = await (networkSvc as any).startOauth2(
      'https://www.dropbox.com/oauth2/authorize',
      {
        client_id: getAppKey(fullAccess),
        response_type: 'token',
      },
      silent,
    );

    // Call the user info endpoint
    const { body } = await request({ accessToken }, {
      method: 'POST',
      url: 'https://api.dropboxapi.com/2/users/get_current_account',
    });
    (userSvc as any).addUserInfo({
      id: `${subPrefix}:${body.account_id}`,
      name: body.name.display_name,
      imageUrl: body.profile_photo_url || '',
    });

    // Check the returned sub consistency
    if (sub && `${body.account_id}` !== sub) {
      throw new Error('Dropbox account ID not expected.');
    }

    // Build token object including scopes and sub
    const token = {
      accessToken,
      name: body.name.display_name,
      sub: `${body.account_id}`,
      fullAccess,
    };

    // Add token to dropbox tokens
    useDataStore().addDropboxToken(token);
    return token;
  },
  async addAccount(fullAccess: any = false): Promise<any> {
    const token = await this.startOauth2(fullAccess);
    (badgeSvc as any).addBadge('addDropboxAccount');
    return token;
  },

  /**
   * https://www.dropbox.com/developers/documentation/http/documentation#files-upload
   */
  async uploadFile({
    token,
    path,
    content,
    fileId,
  }: any): Promise<any> {
    return (await request(token, {
      method: 'POST',
      url: 'https://content.dropboxapi.com/2/files/upload',
      body: content,
    }, {
      path: fileId || path,
      mode: 'overwrite',
    })).body;
  },

  /**
   * https://www.dropbox.com/developers/documentation/http/documentation#files-download
   */
  async downloadFile({
    token,
    path,
    fileId,
  }: any): Promise<any> {
    const res = await request(token, {
      method: 'POST',
      url: 'https://content.dropboxapi.com/2/files/download',
      raw: true,
    }, {
      path: fileId || path,
    });
    return {
      id: JSON.parse(res.headers['dropbox-api-result']).id,
      content: res.body,
    };
  },

  /**
   * https://www.dropbox.com/developers/documentation/http/documentation#list-revisions
   */
  async listRevisions({
    token,
    path,
    fileId,
  }: any): Promise<any[]> {
    const res = await request(token, {
      method: 'POST',
      url: 'https://api.dropboxapi.com/2/files/list_revisions',
      body: fileId ? {
        path: fileId,
        mode: 'id',
        limit: 100,
      } : {
        path,
        limit: 100,
      },
    });
    return res.body.entries;
  },

  /**
   * https://www.dropbox.com/developers/chooser
   */
  async openChooser(token: any): Promise<any> {
    if (!(window as any).Dropbox) {
      await (networkSvc as any).loadScript('https://www.dropbox.com/static/api/2/dropins.js');
    }
    return new Promise((resolve) => {
      (window as any).Dropbox.appKey = getAppKey(token.fullAccess);
      (window as any).Dropbox.choose({
        multiselect: true,
        linkType: 'direct',
        success: (files: any) => resolve(files.map((file: any) => {
          const path = file.link.replace(/.*\/view\/[^/]*/, '');
          return decodeURI(path);
        })),
        cancel: () => resolve([]),
      });
    });
  },
};
