import { clientIp, rateLimit } from './_utils.js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (!(await rateLimit(`conf:${clientIp(req)}`, 120))) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
  }
  const body = {
    dropboxAppKey: process.env.DROPBOX_APP_KEY || '',
    dropboxAppKeyFull: process.env.DROPBOX_APP_KEY_FULL || '',
    githubClientId: process.env.GITHUB_CLIENT_ID || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleApiKey: process.env.GOOGLE_API_KEY || '',
    wordpressClientId: process.env.WORDPRESS_CLIENT_ID || '',
    allowSponsorship: false,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, max-age=60',
    },
  });
}
