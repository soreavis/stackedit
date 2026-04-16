import { clientIp, rateLimit } from './_utils.js';

export default function handler(req, res) {
  if (!rateLimit(`conf:${clientIp(req)}`, 120)) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.status(200).json({
    dropboxAppKey: process.env.DROPBOX_APP_KEY || '',
    dropboxAppKeyFull: process.env.DROPBOX_APP_KEY_FULL || '',
    githubClientId: process.env.GITHUB_CLIENT_ID || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleApiKey: process.env.GOOGLE_API_KEY || '',
    wordpressClientId: process.env.WORDPRESS_CLIENT_ID || '',
    allowSponsorship: false,
  });
}
