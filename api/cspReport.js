import { clientIp, rateLimit } from './_utils.js';

export const config = { api: { bodyParser: false } };

const MAX_REPORT_BYTES = 16 * 1024;

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_REPORT_BYTES) {
      throw new Error('too_large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }
  if (!rateLimit(`cspReport:${clientIp(req)}`, 60)) {
    return res.status(204).end();
  }
  const len = Number(req.headers['content-length'] || 0);
  if (len > MAX_REPORT_BYTES) {
    return res.status(413).end();
  }
  try {
    const raw = await readBody(req);
    const report = raw ? JSON.parse(raw) : {};
    console.warn('[csp-report]', JSON.stringify(report));
  } catch {
    // ignore malformed reports
  }
  res.status(204).end();
}
