// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import handler from '../../../api/cspReport.js';

const uniqueIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const mkReq = (body, { method = 'POST', headers = {} } = {}) => new Request(
  'https://stackedit.example/cspReport',
  {
    method,
    headers: {
      'x-forwarded-for': uniqueIp(),
      'content-length': body ? String(new Blob([body]).size) : '0',
      ...headers,
    },
    body: body == null ? undefined : body,
  },
);

describe('api/cspReport (edge)', () => {
  it('returns 405 for non-POST', async () => {
    const res = await handler(mkReq(null, { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('returns 413 when content-length header exceeds cap', async () => {
    const res = await handler(mkReq('x'.repeat(200), { headers: { 'content-length': String(32 * 1024) } }));
    expect(res.status).toBe(413);
  });

  it('returns 204 and logs the report on valid input', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const payload = JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src' } });
    const res = await handler(mkReq(payload));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledWith('[csp-report]', expect.stringContaining('violated-directive'));
    warn.mockRestore();
  });

  it('returns 204 on malformed JSON (does not throw)', async () => {
    const res = await handler(mkReq('{bad json}'));
    expect(res.status).toBe(204);
  });
});
