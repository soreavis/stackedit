// @vitest-environment node
import { describe, it, expect } from 'vitest';
import confHandler from '../../../api/conf.js';
import userInfoHandler from '../../../api/userInfo.js';
import googleDriveAction from '../../../api/googleDriveAction.js';
import pdfExport from '../../../api/pdfExport.js';
import pandocExport from '../../../api/pandocExport.js';

// Edge runtime: handlers accept a Fetch API Request and return a Response.
const uniqueIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const mkEdgeReq = (url = 'https://stackedit.example/conf', headers = {}, method = 'GET') => new Request(
  url,
  {
    method,
    headers: { 'x-forwarded-for': uniqueIp(), ...headers },
  },
);

// Node serverless mock for the remaining 501-stub handlers.
const mkNodeRes = () => {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
    end() { return this; },
  };
  return res;
};

describe('api/conf (edge)', () => {
  it('returns the public config object with a private cache', async () => {
    const res = await confHandler(mkEdgeReq('https://stackedit.example/conf'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      dropboxAppKey: expect.any(String),
      githubClientId: expect.any(String),
      googleClientId: expect.any(String),
      allowSponsorship: false,
    });
    expect(res.headers.get('cache-control')).toMatch(/private/);
  });

  it('returns 429 once the per-IP rate limit is exhausted', async () => {
    const ip = uniqueIp();
    let last;
    for (let i = 0; i < 125; i += 1) {
      last = await confHandler(mkEdgeReq('https://stackedit.example/conf', { 'x-forwarded-for': ip }));
    }
    expect(last.status).toBe(429);
    expect(await last.json()).toEqual({ error: 'rate_limited' });
  });
});

describe('api/userInfo (edge)', () => {
  it('returns { sponsorUntil: 0 } with a private cache', async () => {
    const res = await userInfoHandler(mkEdgeReq('https://stackedit.example/userInfo'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sponsorUntil: 0 });
    expect(res.headers.get('cache-control')).toMatch(/private/);
  });
});

describe('api/googleDriveAction (edge)', () => {
  it('redirects to the in-app hash with encoded state', async () => {
    const res = await googleDriveAction(mkEdgeReq('https://stackedit.example/googleDriveAction?state=abc+def'));
    expect(res.status).toBe(302);
    const loc = res.headers.get('location');
    expect(loc).toContain('/app#providerId=googleDrive&state=');
    expect(decodeURIComponent(new URL(loc).hash)).toContain('abc def');
  });

  it('does not redirect to an attacker-controlled location even if state looks like a URL', async () => {
    const res = await googleDriveAction(
      mkEdgeReq('https://stackedit.example/googleDriveAction?state=https%3A%2F%2Fattacker.example'),
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get('location');
    expect(new URL(loc).host).toBe('stackedit.example');
    expect(loc).not.toContain('attacker.example/');
  });
});

describe('api/pdfExport + api/pandocExport stubs (node serverless)', () => {
  it('pdfExport returns a 501 with a helpful error body', () => {
    const res = mkNodeRes();
    pdfExport({}, res);
    expect(res.statusCode).toBe(501);
    expect(res.body.error).toBe('pdf_export_unavailable');
  });

  it('pandocExport returns a 501 with a helpful error body', () => {
    const res = mkNodeRes();
    pandocExport({}, res);
    expect(res.statusCode).toBe(501);
    expect(res.body.error).toBe('pandoc_export_unavailable');
  });
});
