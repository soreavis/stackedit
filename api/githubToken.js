export default async function handler(req, res) {
  const { clientId, code } = req.query;
  if (!clientId || !code) {
    return res.status(400).send('missing_params');
  }

  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: process.env.GITHUB_CLIENT_SECRET || '',
        code,
      }).toString(),
    });

    const data = await response.json();
    if (data.access_token) {
      return res.status(200).send(data.access_token);
    }
    return res.status(400).send(data.error || 'bad_code');
  } catch (err) {
    return res.status(500).send(err.message || 'server_error');
  }
}
