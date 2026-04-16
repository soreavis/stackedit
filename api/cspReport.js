import { clientIp, rateLimit } from './_utils.js';

export const config = { runtime: 'edge' };

const MAX_REPORT_BYTES = 16 * 1024;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }
  if (!(await rateLimit(`cspReport:${clientIp(req)}`, 60))) {
    return new Response(null, { status: 204 });
  }
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413 });
  }
  try {
    const raw = await req.text();
    if (raw.length > MAX_REPORT_BYTES) {
      return new Response(null, { status: 413 });
    }
    const report = raw ? JSON.parse(raw) : {};
    console.warn('[csp-report]', JSON.stringify(report));
  } catch {
    // ignore malformed reports
  }
  return new Response(null, { status: 204 });
}
