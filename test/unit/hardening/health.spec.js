// @vitest-environment node
import { describe, it, expect } from 'vitest';
import handler from '../../../api/health.js';

describe('api/health (edge)', () => {
  it('returns 200 with status + version + ts', async () => {
    const res = await handler(new Request('https://stackedit.example/health'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.version).toBe('string');
    expect(typeof body.ts).toBe('number');
  });

  it('uses VERCEL_GIT_COMMIT_SHA when present', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'abc1234deadbeef';
    try {
      const res = await handler(new Request('https://stackedit.example/health'));
      const body = await res.json();
      expect(body.version).toBe('abc1234');
    } finally {
      delete process.env.VERCEL_GIT_COMMIT_SHA;
    }
  });
});
