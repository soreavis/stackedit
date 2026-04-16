// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const vercel = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../vercel.json'), 'utf8'),
);

const globalHeaders = vercel.headers.find(h => h.source === '/(.*)').headers;
const byKey = globalHeaders.reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {});

describe('vercel.json — required security headers', () => {
  it.each([
    'Strict-Transport-Security',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'X-Permitted-Cross-Domain-Policies',
    'Cross-Origin-Opener-Policy',
    'Cross-Origin-Resource-Policy',
    'Referrer-Policy',
    'Permissions-Policy',
    'Report-To',
    'Content-Security-Policy',
  ])('includes %s', (key) => {
    expect(byKey[key]).toBeTruthy();
  });

  it('HSTS is preload-eligible (2 yrs + includeSubDomains + preload)', () => {
    expect(byKey['Strict-Transport-Security']).toMatch(/max-age=\d+/);
    expect(byKey['Strict-Transport-Security']).toContain('includeSubDomains');
    expect(byKey['Strict-Transport-Security']).toContain('preload');
    const maxAge = parseInt(byKey['Strict-Transport-Security'].match(/max-age=(\d+)/)[1], 10);
    expect(maxAge).toBeGreaterThanOrEqual(31536000);
  });

  it('X-Frame-Options denies framing', () => {
    expect(byKey['X-Frame-Options']).toBe('DENY');
  });

  it('Report-To value parses as JSON and targets /cspReport', () => {
    const reportTo = JSON.parse(byKey['Report-To']);
    expect(reportTo.group).toBe('csp-endpoint');
    expect(reportTo.endpoints[0].url).toBe('/cspReport');
  });
});

describe('vercel.json — Content-Security-Policy directives', () => {
  const csp = byKey['Content-Security-Policy'];

  it('default-src is self', () => {
    expect(csp).toMatch(/default-src\s+'self'/);
  });

  it('script-src does NOT allow unsafe-eval on main thread', () => {
    const scriptSrc = csp.match(/script-src\s+([^;]+)/)[1];
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('object-src is none', () => {
    expect(csp).toMatch(/object-src\s+'none'/);
  });

  it('frame-ancestors is none (belt-and-suspenders with XFO)', () => {
    expect(csp).toMatch(/frame-ancestors\s+'none'/);
  });

  it('require-trusted-types-for script is set', () => {
    expect(csp).toContain("require-trusted-types-for 'script'");
  });

  it('trusted-types names default + dompurify', () => {
    expect(csp).toMatch(/trusted-types[^;]*default/);
    expect(csp).toMatch(/trusted-types[^;]*dompurify/);
  });

  it('upgrade-insecure-requests is set', () => {
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('CSP reporting (report-uri + report-to) is wired', () => {
    expect(csp).toContain('report-uri /cspReport');
    expect(csp).toContain('report-to csp-endpoint');
  });

  it('connect-src is explicit allowlist, not blanket https:', () => {
    const connectSrc = csp.match(/connect-src\s+([^;]+)/)[1];
    expect(connectSrc).toContain("'self'");
    expect(connectSrc).toContain('https://api.github.com');
    expect(connectSrc).toContain('https://api.dropboxapi.com');
    expect(connectSrc).toContain('https://www.googleapis.com');
    expect(connectSrc.trim()).not.toMatch(/^'self'\s+https:$/);
  });

  it('frame-src is tight (self + accounts.google.com only)', () => {
    const frameSrc = csp.match(/frame-src\s+([^;]+)/)[1];
    expect(frameSrc).toContain("'self'");
    expect(frameSrc).toContain('https://accounts.google.com');
    expect(frameSrc).not.toContain('apis.google.com');
  });
});

describe('vercel.json — per-file CSP for template worker', () => {
  const workerRule = vercel.headers.find(h => h.source.includes('templateWorker'));

  it('template worker has its own CSP entry', () => {
    expect(workerRule).toBeTruthy();
  });

  it('worker CSP allows unsafe-eval (scoped to worker only)', () => {
    const csp = workerRule.headers.find(h => h.key === 'Content-Security-Policy').value;
    expect(csp).toContain("'unsafe-eval'");
  });
});

describe('vercel.json — fonts CORP override', () => {
  const fontRule = vercel.headers.find(h => /woff/.test(h.source));

  it('fonts have Access-Control-Allow-Origin: *', () => {
    const val = fontRule.headers.find(h => h.key === 'Access-Control-Allow-Origin').value;
    expect(val).toBe('*');
  });

  it('fonts override CORP to cross-origin', () => {
    const val = fontRule.headers.find(h => h.key === 'Cross-Origin-Resource-Policy').value;
    expect(val).toBe('cross-origin');
  });
});

describe('vercel.json — rewrites', () => {
  it('maps /cspReport to /api/cspReport', () => {
    const rewrite = vercel.rewrites.find(r => r.source === '/cspReport');
    expect(rewrite).toBeTruthy();
    expect(rewrite.destination).toBe('/api/cspReport');
  });
});

describe('vercel.json — build / deploy config', () => {
  it('installCommand forces --legacy-peer-deps (old vue 2 devDeps need it)', () => {
    expect(vercel.installCommand).toContain('--legacy-peer-deps');
  });

  it('ignoreCommand skips deploys for docs-only / test-only changes', () => {
    expect(vercel.ignoreCommand).toContain("':(exclude)test'");
    expect(vercel.ignoreCommand).toContain("':(exclude).github'");
  });

  it('functions config bounds memory + duration on Node-runtime routes', () => {
    expect(vercel.functions['api/githubToken.js']).toBeTruthy();
    expect(vercel.functions['api/githubToken.js'].maxDuration).toBeLessThanOrEqual(10);
    expect(vercel.functions['api/pdfExport.js'].memory).toBeLessThanOrEqual(128);
    expect(vercel.functions['api/pandocExport.js'].memory).toBeLessThanOrEqual(128);
  });
});
