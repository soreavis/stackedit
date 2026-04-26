// HTTP / OAuth plumbing for WordPress. Method params + response payloads
// kept loose (`any`) — vendor APIs return dynamic shapes.
import networkSvc from '../../networkSvc';
import { useModalStore } from '../../../stores/modal';
import badgeSvc from '../../badgeSvc';
import { useDataStore } from '../../../stores/data';

const tokenExpirationMargin = 5 * 60 * 1000; // 5 min (WordPress tokens expire after 2 weeks)

const request = (token: any, options: any): Promise<any> => (networkSvc as any).request({
  ...options,
  headers: {
    ...options.headers || {},
    Authorization: `Bearer ${token.accessToken}`,
  },
})
  .then((res: any) => res.body);

export default {
  /**
   * https://developer.wordpress.com/docs/oauth2/
   */
  async startOauth2(sub: any = null, silent: boolean = false): Promise<any> {
    const clientId = (useDataStore().serverConf as any).wordpressClientId;

    // Get an OAuth2 code
    const { accessToken, expiresIn } = await (networkSvc as any).startOauth2(
      'https://public-api.wordpress.com/oauth2/authorize',
      {
        client_id: clientId,
        response_type: 'token',
        scope: 'global',
      },
      silent,
    );

    // Call the user info endpoint
    const body = await request({ accessToken }, {
      url: 'https://public-api.wordpress.com/rest/v1.1/me',
    });

    // Check the returned sub consistency
    if (sub && `${body.ID}` !== sub) {
      throw new Error('WordPress account ID not expected.');
    }
    // Build token object including scopes and sub
    const token = {
      accessToken,
      expiresOn: Date.now() + (expiresIn * 1000),
      name: body.display_name,
      sub: `${body.ID}`,
    };
    // Add token to wordpress tokens
    useDataStore().addWordpressToken(token);
    return token;
  },
  async refreshToken(token: any): Promise<any> {
    const { sub } = token;
    const lastToken: any = useDataStore().wordpressTokensBySub[sub];

    if (lastToken.expiresOn > Date.now() + tokenExpirationMargin) {
      return lastToken;
    }
    // Existing token is going to expire.
    // Try to get a new token in background
    await useModalStore().open({
      type: 'providerRedirection',
      name: 'WordPress',
    });
    return this.startOauth2(sub);
  },
  async addAccount(fullAccess: any = false): Promise<any> {
    const token = await this.startOauth2(fullAccess);
    (badgeSvc as any).addBadge('addWordpressAccount');
    return token;
  },

  /**
   * https://developer.wordpress.com/docs/api/1.2/post/sites/%24site/posts/new/
   * https://developer.wordpress.com/docs/api/1.2/post/sites/%24site/posts/%24post_ID/
   */
  async uploadPost({
    token,
    domain,
    siteId,
    postId,
    title,
    content,
    tags,
    categories,
    excerpt,
    author,
    featuredImage,
    status,
    date,
  }: any): Promise<any> {
    const refreshedToken = await this.refreshToken(token);
    return request(refreshedToken, {
      method: 'POST',
      url: `https://public-api.wordpress.com/rest/v1.2/sites/${siteId || domain}/posts/${postId || 'new'}`,
      body: {
        content,
        title,
        tags,
        categories,
        excerpt,
        author,
        featured_image: featuredImage || '',
        status,
        date: date && date.toISOString(),
      },
    });
  },
};
