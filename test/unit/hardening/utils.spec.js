// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { clientIp, rateLimit, sameOrigin } from '../../../api/_utils.js';

const mkReq = (headers = {}, remoteAddress = '10.0.0.1') => ({
  headers,
  socket: { remoteAddress },
});

describe('api/_utils clientIp', () => {
  it('prefers x-forwarded-for first entry', () => {
    expect(clientIp(mkReq({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
  });
  it('trims whitespace in x-forwarded-for', () => {
    expect(clientIp(mkReq({ 'x-forwarded-for': '  9.9.9.9 , 8.8.8.8' }))).toBe('9.9.9.9');
  });
  it('falls back to socket remoteAddress', () => {
    expect(clientIp(mkReq({}))).toBe('10.0.0.1');
  });
  it('returns "unknown" when nothing is available', () => {
    expect(clientIp({ headers: {}, socket: {} })).toBe('unknown');
  });
  it('ignores non-string x-forwarded-for', () => {
    expect(clientIp(mkReq({ 'x-forwarded-for': ['1.2.3.4'] }))).toBe('10.0.0.1');
  });
});

describe('api/_utils sameOrigin', () => {
  it('allows when Origin host matches Host header', () => {
    expect(sameOrigin(mkReq({ origin: 'https://stackedit.example', host: 'stackedit.example' }))).toBe(true);
  });
  it('rejects when Origin host differs from Host', () => {
    expect(sameOrigin(mkReq({ origin: 'https://attacker.example', host: 'stackedit.example' }))).toBe(false);
  });
  it('rejects when Origin is missing', () => {
    expect(sameOrigin(mkReq({ host: 'stackedit.example' }))).toBe(false);
  });
  it('rejects when Host is missing', () => {
    expect(sameOrigin(mkReq({ origin: 'https://stackedit.example' }))).toBe(false);
  });
  it('rejects malformed Origin values', () => {
    expect(sameOrigin(mkReq({ origin: 'not-a-url', host: 'stackedit.example' }))).toBe(false);
  });
  it('allows http when ports and host match', () => {
    expect(sameOrigin(mkReq({ origin: 'http://localhost:8080', host: 'localhost:8080' }))).toBe(true);
  });
});

describe('api/_utils rateLimit (in-memory fallback, no Upstash env)', () => {
  it('lets traffic through below the limit', async () => {
    const key = `low:${Math.random()}`;
    for (let i = 0; i < 5; i += 1) {
      expect(await rateLimit(key, 5)).toBe(true);
    }
  });

  it('blocks after the limit is exceeded', async () => {
    const key = `block:${Math.random()}`;
    for (let i = 0; i < 3; i += 1) expect(await rateLimit(key, 3)).toBe(true);
    expect(await rateLimit(key, 3)).toBe(false);
    expect(await rateLimit(key, 3)).toBe(false);
  });

  it('tracks different keys independently', async () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    for (let i = 0; i < 2; i += 1) {
      expect(await rateLimit(a, 2)).toBe(true);
      expect(await rateLimit(b, 2)).toBe(true);
    }
    expect(await rateLimit(a, 2)).toBe(false);
    expect(await rateLimit(b, 2)).toBe(false);
  });
});

describe('api/_utils sameOrigin (Edge Headers API)', () => {
  it('accepts a Fetch API Request-style headers object', () => {
    const req = new Request('https://stackedit.example/x', {
      headers: { origin: 'https://stackedit.example', host: 'stackedit.example' },
    });
    expect(sameOrigin(req)).toBe(true);
  });
});

describe('api/_utils clientIp (Edge Headers API)', () => {
  it('reads x-forwarded-for from Headers instance', () => {
    const req = new Request('https://stackedit.example/x', {
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
    });
    expect(clientIp(req)).toBe('1.2.3.4');
  });
});
