// Works with both Node-runtime serverless (req.headers is a plain object,
// req.socket.remoteAddress exists) and Edge runtime (req.headers is a
// Fetch Headers instance, no req.socket).
//
// rateLimit() uses Upstash Redis when UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN are set, otherwise falls back to a per-instance
// in-memory Map. Always safe to call.

const WINDOW_MS = 60 * 1000;
const memoryBuckets = new Map();
let upstashLimiters = null;

function getHeader(req, name) {
  const h = req.headers;
  if (!h) return undefined;
  if (typeof h.get === 'function') return h.get(name);
  return h[name.toLowerCase()];
}

export function clientIp(req) {
  const fwd = getHeader(req, 'x-forwarded-for');
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return getHeader(req, 'x-real-ip') || req.socket?.remoteAddress || 'unknown';
}

export function sameOrigin(req) {
  const origin = getHeader(req, 'origin');
  const host = getHeader(req, 'host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function inMemoryLimit(key, max) {
  const now = Date.now();
  const entry = memoryBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    memoryBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

function upstashConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL
    && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

async function getUpstashLimiter(max) {
  if (!upstashLimiters) upstashLimiters = new Map();
  let limiter = upstashLimiters.get(max);
  if (!limiter) {
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import('@upstash/ratelimit'),
      import('@upstash/redis'),
    ]);
    limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(max, '60 s'),
      analytics: false,
      prefix: 'stackedit',
    });
    upstashLimiters.set(max, limiter);
  }
  return limiter;
}

export async function rateLimit(key, max) {
  if (!upstashConfigured()) return inMemoryLimit(key, max);
  try {
    const limiter = await getUpstashLimiter(max);
    const { success } = await limiter.limit(key);
    return success;
  } catch (err) {
    // Never fail closed; on Upstash outage, degrade to in-memory so the
    // site keeps working.
    console.warn('[ratelimit] upstash unavailable, falling back:', err?.message);
    return inMemoryLimit(key, max);
  }
}
