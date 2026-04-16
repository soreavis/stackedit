// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../../../api/githubToken.js';

const uniqueIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

const mkRes = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  send(body) { this.body = body; return this; },
});

const mkReq = (query = {}, overrides = {}) => ({
  query,
  method: 'GET',
  headers: {
    origin: 'https://stackedit.example',
    host: 'stackedit.example',
    'content-length': '0',
    ...(overrides.headers || {}),
  },
  socket: { remoteAddress: overrides.remoteAddress || uniqueIp() },
});

beforeEach(() => {
  process.env.GITHUB_CLIENT_ID = 'real-client-id';
  process.env.GITHUB_CLIENT_SECRET = 'real-client-secret';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api/githubToken — request gating', () => {
  it('403 without same-origin', async () => {
    const req = mkReq({ clientId: 'real-client-id', code: 'abc' }, {
      headers: { origin: 'https://attacker.example', host: 'stackedit.example' },
    });
    const res = mkRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toBe('forbidden');
  });

  it('400 missing_params when clientId or code missing', async () => {
    const res = mkRes();
    await handler(mkReq({}), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toBe('missing_params');
  });

  it('400 invalid_client when clientId does not match env', async () => {
    const res = mkRes();
    await handler(mkReq({ clientId: 'different', code: 'abc' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toBe('invalid_client');
  });

  it('413 payload_too_large when content-length exceeds 4 KB', async () => {
    const res = mkRes();
    await handler(mkReq(
      { clientId: 'real-client-id', code: 'abc' },
      { headers: { 'content-length': '8192' } },
    ), res);
    expect(res.statusCode).toBe(413);
    expect(res.body).toBe('payload_too_large');
  });
});

describe('api/githubToken — token exchange', () => {
  it('forwards PKCE code_verifier to GitHub when present and valid', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ access_token: 'gho_test' }),
    });
    const res = mkRes();
    const verifier = 'A'.repeat(43); // valid 43-char [A-Za-z0-9-._~]
    await handler(
      mkReq({ clientId: 'real-client-id', code: 'auth-code', codeVerifier: verifier }),
      res,
    );
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, opts] = fetchSpy.mock.calls[0];
    const body = String(opts.body);
    expect(body).toContain('code_verifier=' + verifier);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('gho_test');
  });

  it('does NOT forward code_verifier when it fails the charset/length check', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ access_token: 'gho_test' }),
    });
    const res = mkRes();
    await handler(
      mkReq({ clientId: 'real-client-id', code: 'auth-code', codeVerifier: 'short' }),
      res,
    );
    const [, opts] = fetchSpy.mock.calls[0];
    expect(String(opts.body)).not.toContain('code_verifier');
  });

  it('rejects code_verifier with disallowed characters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ access_token: 'gho_test' }),
    });
    const res = mkRes();
    await handler(
      mkReq({ clientId: 'real-client-id', code: 'auth-code', codeVerifier: 'A'.repeat(60) + '<bad>' }),
      res,
    );
    const [, opts] = fetchSpy.mock.calls[0];
    expect(String(opts.body)).not.toContain('code_verifier');
  });

  it('returns 400 bad_code when GitHub returns no access_token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ error: 'bad_verification_code' }),
    });
    const res = mkRes();
    await handler(mkReq({ clientId: 'real-client-id', code: 'auth-code' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toBe('bad_code');
  });

  it('returns 500 server_error on fetch throw and masks the message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mkRes();
    await handler(mkReq({ clientId: 'real-client-id', code: 'auth-code' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toBe('server_error');
    expect(res.body).not.toContain('network down');
  });
});
