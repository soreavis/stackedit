export const config = { runtime: 'edge' };

const WINDOW_MS = 60 * 1000;
const RATE_MAX = 120;
const buckets = new Map();

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function rateLimit(key) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count += 1;
  return true;
}

export default function handler(req) {
  if (!rateLimit(`conf:${clientIp(req)}`)) {
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
