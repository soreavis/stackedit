import { clientIp, rateLimit } from './_utils.js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (!(await rateLimit(`userInfo:${clientIp(req)}`, 120))) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ sponsorUntil: 0 }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, max-age=60',
    },
  });
}
