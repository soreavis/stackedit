export default function handler(req, res) {
  const state = encodeURIComponent(req.query.state || '');
  res.redirect(302, `/app#providerId=googleDrive&state=${state}`);
}
