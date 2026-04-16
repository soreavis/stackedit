import { pdfHandler } from './pdfMiddleware.js';
import { pandocHandler } from './pandocMiddleware.js';

export default function devApiPlugin() {
  return {
    name: 'stackedit-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        res.statusCode = 404;
        res.end('Not found (use production rewrites in vercel.json).');
      });
      server.middlewares.use('/pdfExport', pdfHandler);
      server.middlewares.use('/pandocExport', pandocHandler);
      server.middlewares.use('/conf', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          dropboxAppKey: process.env.DROPBOX_APP_KEY || '',
          dropboxAppKeyFull: process.env.DROPBOX_APP_KEY_FULL || '',
          githubClientId: process.env.GITHUB_CLIENT_ID || '',
          googleClientId: process.env.GOOGLE_CLIENT_ID || '',
          googleApiKey: process.env.GOOGLE_API_KEY || '',
          wordpressClientId: process.env.WORDPRESS_CLIENT_ID || '',
          allowSponsorship: false,
        }));
      });
      server.middlewares.use('/userInfo', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ sponsorUntil: 0 }));
      });
    },
  };
}
