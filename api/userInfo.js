import { clientIp, rateLimit } from './_utils.js';

export default function handler(req, res) {
  if (!rateLimit(`userInfo:${clientIp(req)}`, 120)) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.status(200).json({ sponsorUntil: 0 });
}
