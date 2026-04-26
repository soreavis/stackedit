// HTTP / OAuth plumbing for Zendesk Help Center publish. Method params
// + response payloads kept loose (`any`).
import zendeskHelper from './helpers/zendeskHelper';
import Provider from './common/Provider';
import { useDataStore } from '../../stores/data';

export default new Provider({
  id: 'zendesk',
  name: 'Zendesk',
  getToken({ sub }: any): any {
    return useDataStore().zendeskTokensBySub[sub];
  },
  getLocationUrl({ sub, locale, articleId }: any): string {
    const token = (this as any).getToken({ sub });
    return `https://${token.subdomain}.zendesk.com/hc/${locale}/articles/${articleId}`;
  },
  getLocationDescription({ articleId }: any): string {
    return articleId;
  },
  async publish(token: any, html: string, metadata: any, publishLocation: any): Promise<any> {
    const articleId = await (zendeskHelper as any).uploadArticle({
      ...publishLocation,
      token,
      title: metadata.title,
      content: html,
      labels: metadata.tags,
      isDraft: metadata.status === 'draft',
    });
    return {
      ...publishLocation,
      articleId,
    };
  },
  makeLocation(token: any, sectionId: string, locale: string, articleId?: string): any {
    const location: any = {
      providerId: (this as any).id,
      sub: token.sub,
      sectionId,
      locale,
    };
    if (articleId) {
      location.articleId = articleId;
    }
    return location;
  },
});
