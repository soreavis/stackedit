// HTTP / OAuth plumbing for Blogger pages. Method params + response
// payloads kept loose because shapes vary across the Blogger v3 API.
import googleHelper from './helpers/googleHelper';
import Provider from './common/Provider';
import { useDataStore } from '../../stores/data';

export default new Provider({
  id: 'bloggerPage',
  name: 'Blogger Page',
  getToken({ sub }: any): any {
    const token = useDataStore().googleTokensBySub[sub];
    return token && (token as any).isBlogger ? token : null;
  },
  getLocationUrl({ blogId, pageId }: any): string {
    return `https://www.blogger.com/blogger.g?blogID=${blogId}#editor/target=page;pageID=${pageId}`;
  },
  getLocationDescription({ pageId }: any): string {
    return pageId;
  },
  async publish(token: any, html: string, metadata: any, publishLocation: any): Promise<any> {
    const page = await (googleHelper as any).uploadBlogger({
      token,
      blogUrl: publishLocation.blogUrl,
      blogId: publishLocation.blogId,
      postId: publishLocation.pageId,
      title: metadata.title,
      content: html,
      isPage: true,
    });
    return {
      ...publishLocation,
      blogId: page.blog.id,
      pageId: page.id,
    };
  },
  makeLocation(token: any, blogUrl: string, pageId?: string): any {
    const location: any = {
      providerId: (this as any).id,
      sub: token.sub,
      blogUrl,
    };
    if (pageId) {
      location.pageId = pageId;
    }
    return location;
  },
});
