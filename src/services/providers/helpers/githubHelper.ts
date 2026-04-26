// HTTP / OAuth plumbing for GitHub. Method params + response payloads
// kept loose (`any`) — vendor APIs return dynamic shapes.
import utils from '../../utils';
import networkSvc from '../../networkSvc';
import userSvc from '../../userSvc';
import badgeSvc from '../../badgeSvc';
import { useDataStore } from '../../../stores/data';

const getScopes = (token: any): any[] => [token.repoFullAccess ? 'repo' : 'public_repo', 'gist'];

const request = (token: any, options: any): Promise<any> => (networkSvc as any).request({
  ...options,
  headers: {
    ...options.headers || {},
    Authorization: `token ${token.accessToken}`,
  },
  params: {
    ...options.params || {},
    t: Date.now(), // Prevent from caching
  },
});

const repoRequest = (token: any, owner: any, repo: any, options: any): Promise<any> => request(token, {
  ...options,
  url: `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${options.url}`,
})
  .then((res: any) => res.body);

const getCommitMessage = (name: any, path: any): any => {
  const message = (useDataStore().computedSettings as any).git[name];
  return message.replace(/{{path}}/g, path);
};

/**
 * Getting a user from its userId is not feasible with API v3.
 * Using an undocumented endpoint...
 */
const subPrefix = 'gh';
(userSvc as any).setInfoResolver('github', subPrefix, async (sub: any) => {
  try {
    const user = (await (networkSvc as any).request({
      url: `https://api.github.com/user/${sub}`,
      params: {
        t: Date.now(), // Prevent from caching
      },
    })).body;

    return {
      id: `${subPrefix}:${user.id}`,
      name: user.login,
      imageUrl: user.avatar_url || '',
    };
  } catch (err: any) {
    if (err.status !== 404) {
      throw new Error('RETRY');
    }
    throw err;
  }
});

export default {
  subPrefix,

  /**
   * https://developer.github.com/apps/building-oauth-apps/authorization-options-for-oauth-apps/
   */
  async startOauth2(scopes: any[], sub: any = null, silent: boolean = false): Promise<any> {
    const clientId = (useDataStore().serverConf as any).githubClientId;

    // Get an OAuth2 code (PKCE-protected)
    const { code, codeVerifier } = await (networkSvc as any).startOauth2(
      'https://github.com/login/oauth/authorize',
      {
        client_id: clientId,
        scope: scopes.join(' '),
        pkce: true,
      },
      silent,
    );

    // Exchange code with token
    const accessToken = (await (networkSvc as any).request({
      method: 'GET',
      url: 'oauth2/githubToken',
      params: {
        clientId,
        code,
        codeVerifier,
      },
    })).body;

    // Call the user info endpoint
    const user = (await (networkSvc as any).request({
      method: 'GET',
      url: 'https://api.github.com/user',
      headers: {
        Authorization: `token ${accessToken}`,
      },
    })).body;
    (userSvc as any).addUserInfo({
      id: `${subPrefix}:${user.id}`,
      name: user.login,
      imageUrl: user.avatar_url || '',
    });

    // Check the returned sub consistency
    if (sub && `${user.id}` !== sub) {
      throw new Error('GitHub account ID not expected.');
    }

    // Build token object including scopes and sub
    const token = {
      scopes,
      accessToken,
      name: user.login,
      sub: `${user.id}`,
      repoFullAccess: scopes.includes('repo'),
    };

    // Add token to github tokens
    useDataStore().addGithubToken(token);
    return token;
  },
  async addAccount(repoFullAccess: any = false): Promise<any> {
    const token = await this.startOauth2(getScopes({ repoFullAccess }));
    (badgeSvc as any).addBadge('addGitHubAccount');
    return token;
  },

  /**
   * https://developer.github.com/v3/repos/commits/#get-a-single-commit
   * https://developer.github.com/v3/git/trees/#get-a-tree
   */
  async getTree({
    token,
    owner,
    repo,
    branch,
  }: any): Promise<any> {
    const { commit } = await repoRequest(token, owner, repo, {
      url: `commits/${encodeURIComponent(branch)}`,
    });
    const { tree, truncated } = await repoRequest(token, owner, repo, {
      url: `git/trees/${encodeURIComponent(commit.tree.sha)}?recursive=1`,
    });
    if (truncated) {
      throw new Error('Git tree too big. Please remove some files in the repository.');
    }
    return tree;
  },

  /**
   * https://developer.github.com/v3/repos/commits/#list-commits-on-a-repository
   */
  async getCommits({
    token,
    owner,
    repo,
    sha,
    path,
  }: any): Promise<any> {
    return repoRequest(token, owner, repo, {
      url: 'commits',
      params: { sha, path },
    });
  },

  /**
   * https://developer.github.com/v3/repos/contents/#create-a-file
   * https://developer.github.com/v3/repos/contents/#update-a-file
   */
  async uploadFile({
    token,
    owner,
    repo,
    branch,
    path,
    content,
    sha,
  }: any): Promise<any> {
    return repoRequest(token, owner, repo, {
      method: 'PUT',
      url: `contents/${encodeURIComponent(path)}`,
      body: {
        message: getCommitMessage(sha ? 'updateFileMessage' : 'createFileMessage', path),
        content: (utils as any).encodeBase64(content),
        sha,
        branch,
      },
    });
  },

  /**
   * https://developer.github.com/v3/repos/contents/#delete-a-file
   */
  async removeFile({
    token,
    owner,
    repo,
    branch,
    path,
    sha,
  }: any): Promise<any> {
    return repoRequest(token, owner, repo, {
      method: 'DELETE',
      url: `contents/${encodeURIComponent(path)}`,
      body: {
        message: getCommitMessage('deleteFileMessage', path),
        sha,
        branch,
      },
    });
  },

  /**
   * https://developer.github.com/v3/repos/contents/#get-contents
   */
  async downloadFile({
    token,
    owner,
    repo,
    branch,
    path,
  }: any): Promise<any> {
    const { sha, content } = await repoRequest(token, owner, repo, {
      url: `contents/${encodeURIComponent(path)}`,
      params: { ref: branch },
    });
    return {
      sha,
      data: (utils as any).decodeBase64(content),
    };
  },

  /**
   * https://developer.github.com/v3/gists/#create-a-gist
   * https://developer.github.com/v3/gists/#edit-a-gist
   */
  async uploadGist({
    token,
    description,
    filename,
    content,
    isPublic,
    gistId,
  }: any): Promise<any> {
    const { body } = await request(token, gistId ? {
      method: 'PATCH',
      url: `https://api.github.com/gists/${gistId}`,
      body: {
        description,
        files: {
          [filename]: {
            content,
          },
        },
      },
    } : {
      method: 'POST',
      url: 'https://api.github.com/gists',
      body: {
        description,
        files: {
          [filename]: {
            content,
          },
        },
        public: isPublic,
      },
    });
    return body;
  },

  /**
   * https://developer.github.com/v3/gists/#get-a-single-gist
   */
  async downloadGist({
    token,
    gistId,
    filename,
  }: any): Promise<any> {
    const result = (await request(token, {
      url: `https://api.github.com/gists/${gistId}`,
    })).body.files[filename];
    if (!result) {
      throw new Error('Gist file not found.');
    }
    return result.content;
  },

  /**
   * https://developer.github.com/v3/gists/#list-gist-commits
   */
  async getGistCommits({
    token,
    gistId,
  }: any): Promise<any> {
    const { body } = await request(token, {
      url: `https://api.github.com/gists/${gistId}/commits`,
    });
    return body;
  },

  /**
   * https://developer.github.com/v3/gists/#get-a-specific-revision-of-a-gist
   */
  async downloadGistRevision({
    token,
    gistId,
    filename,
    sha,
  }: any): Promise<any> {
    const result = (await request(token, {
      url: `https://api.github.com/gists/${gistId}/${sha}`,
    })).body.files[filename];
    if (!result) {
      throw new Error('Gist file not found.');
    }
    return result.content;
  },
};
