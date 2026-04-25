// Works with both Node-runtime serverless (req.headers is a plain object,
// req.socket.remoteAddress exists) and Edge runtime (req.headers is a
// Fetch Headers instance, no req.socket).
//
// rateLimit() uses Upstash Redis when UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN are set, otherwise falls back to a per-instance
// in-memory Map. Always safe to call.

type AnyReq = {
  headers?: Headers | Record<string, string | string[] | undefined> | null;
  socket?: { remoteAddress?: string };
};

interface UpstashLimiter {
  limit: (key: string) => Promise<{ success: boolean }>;
}

const WINDOW_MS = 60 * 1000;
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();
let upstashLimiters: Map<number, UpstashLimiter> | null = null;

// Returns the raw header value — could be string, string[], or undefined.
// Callers that need a string MUST narrow with `typeof === 'string'` first;
// `clientIp` relies on this to ignore array-typed `x-forwarded-for`.
function getHeader(req: AnyReq, name: string): string | string[] | undefined {
  const h = req.headers;
  if (!h) return undefined;
  if (typeof (h as Headers).get === 'function') return (h as Headers).get(name) ?? undefined;
  return (h as Record<string, string | string[] | undefined>)[name.toLowerCase()];
}

export function clientIp(req: AnyReq): string {
  const fwd = getHeader(req, 'x-forwarded-for');
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  const realIp = getHeader(req, 'x-real-ip');
  if (typeof realIp === 'string' && realIp.length) return realIp;
  return req.socket?.remoteAddress || 'unknown';
}

export function sameOrigin(req: AnyReq): boolean {
  const origin = getHeader(req, 'origin');
  const host = getHeader(req, 'host');
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function inMemoryLimit(key: string, max: number): boolean {
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

function upstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL
    && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

async function getUpstashLimiter(max: number): Promise<UpstashLimiter> {
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

export async function rateLimit(key: string, max: number): Promise<boolean> {
  if (!upstashConfigured()) return inMemoryLimit(key, max);
  try {
    const limiter = await getUpstashLimiter(max);
    const { success } = await limiter.limit(key);
    return success;
  } catch (err) {
    // Never fail closed; on Upstash outage, degrade to in-memory so the
    // site keeps working.
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[ratelimit] upstash unavailable, falling back:', message);
    return inMemoryLimit(key, max);
  }
}
