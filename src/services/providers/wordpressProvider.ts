// @ts-nocheck
// Provider/helper module — HTTP / OAuth / API plumbing for an external
// sync service. Typed boundary work pending: response shapes vary by
// provider, error handling is dynamic. .ts rename is for migration
// tracking; full typing requires per-provider response interfaces.
import store from '../../store';
import wordpressHelper from './helpers/wordpressHelper';
import Provider from './common/Provider';
import { useDataStore } from '../../stores/data';

export default new Provider({
  id: 'wordpress',
  name: 'WordPress',
  getToken({ sub }) {
    return useDataStore().wordpressTokensBySub[sub];
  },
  getLocationUrl({ siteId, postId }) {
    return `https://wordpress.com/post/${siteId}/${postId}`;
  },
  getLocationDescription({ postId }) {
    return postId;
  },
  async publish(token, html, metadata, publishLocation) {
    const post = await wordpressHelper.uploadPost({
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
  makeLocation(token, domain, postId) {
    const location = {
      providerId: this.id,
      sub: token.sub,
      domain,
    };
    if (postId) {
      location.postId = postId;
    }
    return location;
  },
});
