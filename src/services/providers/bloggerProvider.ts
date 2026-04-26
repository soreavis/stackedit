// HTTP / OAuth plumbing for Blogger posts. Method params + response
// payloads kept loose because shapes vary across the Blogger v3 API.
import googleHelper from './helpers/googleHelper';
import Provider from './common/Provider';
import { useDataStore } from '../../stores/data';

export default new Provider({
  id: 'blogger',
  name: 'Blogger',
  getToken({ sub }: any): any {
    const token = useDataStore().googleTokensBySub[sub];
    return token && (token as any).isBlogger ? token : null;
  },
  getLocationUrl({ blogId, postId }: any): string {
    return `https://www.blogger.com/blogger.g?blogID=${blogId}#editor/target=post;postID=${postId}`;
  },
  getLocationDescription({ postId }: any): string {
    return postId;
  },
  async publish(token: any, html: string, metadata: any, publishLocation: any): Promise<any> {
    const post = await (googleHelper as any).uploadBlogger({
      ...publishLocation,
      token,
      title: metadata.title,
      content: html,
      labels: metadata.tags,
      isDraft: metadata.status === 'draft',
      published: metadata.date,
    });
    return {
      ...publishLocation,
      blogId: post.blog.id,
      postId: post.id,
    };
  },
  makeLocation(token: any, blogUrl: string, postId?: string): any {
    const location: any = {
      providerId: (this as any).id,
      sub: token.sub,
      blogUrl,
    };
    if (postId) {
      location.postId = postId;
    }
    return location;
  },
});
