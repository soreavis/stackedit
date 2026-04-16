export const config = { runtime: 'edge' };

const MAX_REPORT_BYTES = 16 * 1024;
const WINDOW_MS = 60 * 1000;
const RATE_MAX = 60;
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

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }
  if (!rateLimit(`cspReport:${clientIp(req)}`)) {
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
