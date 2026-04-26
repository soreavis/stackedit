// HTTP / OAuth plumbing for Zendesk. Method params + response payloads
// kept loose (`any`) — vendor APIs return dynamic shapes.
import networkSvc from '../../networkSvc';
import badgeSvc from '../../badgeSvc';
import { useDataStore } from '../../../stores/data';

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
   * https://support.zendesk.com/hc/en-us/articles/203663836-Using-OAuth-authentication-with-your-application
   */
  async startOauth2(subdomain: any, clientId: any, sub: any = null, silent: boolean = false): Promise<any> {
    // Get an OAuth2 code
    const { accessToken } = await (networkSvc as any).startOauth2(
      `https://${subdomain}.zendesk.com/oauth/authorizations/new`,
      {
        client_id: clientId,
        response_type: 'token',
        scope: 'read hc:write',
      },
      silent,
    );

    // Call the user info endpoint
    const { user } = await request({ accessToken }, {
      url: `https://${subdomain}.zendesk.com/api/v2/users/me.json`,
    });
    const uniqueSub = `${subdomain}/${user.id}`;

    // Check the returned sub consistency
    if (sub && uniqueSub !== sub) {
      throw new Error('Zendesk account ID not expected.');
    }

    // Build token object including scopes and sub
    const token = {
      accessToken,
      name: user.name,
      subdomain,
      sub: uniqueSub,
    };

    // Add token to zendesk tokens
    useDataStore().addZendeskToken(token);
    return token;
  },
  async addAccount(subdomain: any, clientId: any): Promise<any> {
    const token = await this.startOauth2(subdomain, clientId);
    (badgeSvc as any).addBadge('addZendeskAccount');
    return token;
  },

  /**
   * https://developer.zendesk.com/rest_api/docs/help_center/articles
   */
  async uploadArticle({
    token,
    sectionId,
    articleId,
    title,
    content,
    labels,
    locale,
    isDraft,
  }: any): Promise<any> {
    const article: any = {
      title,
      body: content,
      locale,
      draft: isDraft,
    };

    if (articleId) {
      // Update article
      await request(token, {
        method: 'PUT',
        url: `https://${token.subdomain}.zendesk.com/api/v2/help_center/articles/${articleId}/translations/${locale}.json`,
        body: { translation: article },
      });

      // Add labels
      if (labels) {
        await request(token, {
          method: 'PUT',
          url: `https://${token.subdomain}.zendesk.com/api/v2/help_center/articles/${articleId}.json`,
          body: {
            article: {
              label_names: labels,
            },
          },
        });
      }
      return articleId;
    }

    // Create new article
    if (labels) {
      article.label_names = labels;
    }
    const body = await request(token, {
      method: 'POST',
      url: `https://${token.subdomain}.zendesk.com/api/v2/help_center/sections/${sectionId}/articles.json`,
      body: { article },
    });
    return `${body.article.id}`;
  },
};
