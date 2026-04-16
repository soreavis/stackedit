import { clientIp, rateLimit, sameOrigin } from './_utils.js';

export default async function handler(req, res) {
  if (!sameOrigin(req)) {
    return res.status(403).send('forbidden');
  }
  if (!rateLimit(`githubToken:${clientIp(req)}`, 10)) {
    return res.status(429).send('rate_limited');
  }
  const len = Number(req.headers['content-length'] || 0);
  if (len > 4096) {
    return res.status(413).send('payload_too_large');
  }

  const { clientId, code, codeVerifier } = req.query;
  if (!clientId || !code) {
    return res.status(400).send('missing_params');
  }
  if (clientId !== process.env.GITHUB_CLIENT_ID) {
    return res.status(400).send('invalid_client');
  }

  const body = {
    client_id: clientId,
    client_secret: process.env.GITHUB_CLIENT_SECRET || '',
    code,
  };
  if (typeof codeVerifier === 'string' && /^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier)) {
    body.code_verifier = codeVerifier;
  }

  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(body).toString(),
    });

    const data = await response.json();
    if (data.access_token) {
      return res.status(200).send(data.access_token);
    }
    return res.status(400).send('bad_code');
  } catch (err) {
    console.error('[githubToken]', err);
    return res.status(500).send('server_error');
  }
}
