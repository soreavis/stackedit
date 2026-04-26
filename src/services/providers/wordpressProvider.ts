// HTTP / OAuth plumbing for WordPress.com publish. Method params +
// response payloads kept loose (`any`).
import wordpressHelper from './helpers/wordpressHelper';
import Provider from './common/Provider';
import { useDataStore } from '../../stores/data';

export default new Provider({
  id: 'wordpress',
  name: 'WordPress',
  getToken({ sub }: any): any {
    return useDataStore().wordpressTokensBySub[sub];
  },
  getLocationUrl({ siteId, postId }: any): string {
    return `https://wordpress.com/post/${siteId}/${postId}`;
  },
  getLocationDescription({ postId }: any): string {
    return postId;
  },
  async publish(token: any, html: string, metadata: any, publishLocation: any): Promise<any> {
    const post = await (wordpressHelper as any).uploadPost({
      ...publishLocation,
      ...metadata,
      token,
      content: html,
    });
    return {
      ...publishLocation,
      siteId: `${post.site_ID}`,
      postId: `${post.ID}`,
    };
  },
  makeLocation(token: any, domain: string, postId?: string): any {
    const location: any = {
      providerId: (this as any).id,
      sub: token.sub,
      domain,
    };
    if (postId) {
      location.postId = postId;
    }
    return location;
  },
});
