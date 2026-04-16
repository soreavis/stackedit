export default function handler(req, res) {
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
