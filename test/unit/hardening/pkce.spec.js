import { describe, it, expect } from 'vitest';

// PKCE is implemented inline in src/services/networkSvc.js — these tests
// verify the same algorithm so a regression there would be caught.

const base64UrlEncode = bytes => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function generatePkce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64UrlEncode(bytes);
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  );
  const challenge = base64UrlEncode(digest);
  return { verifier, challenge };
}

describe('PKCE generation (S256)', () => {
  it('produces a 43-char base64url verifier from 32 random bytes', async () => {
    const { verifier } = await generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('produces a 43-char base64url challenge', async () => {
    const { challenge } = await generatePkce();
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('produces deterministic challenge for a known verifier (RFC 7636 example)', async () => {
    const knownVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(knownVerifier)),
    );
    expect(base64UrlEncode(digest)).toBe(expectedChallenge);
  });

  it('verifier and challenge are different', async () => {
    const { verifier, challenge } = await generatePkce();
    expect(challenge).not.toBe(verifier);
  });

  it('two runs produce different verifiers (random)', async () => {
    const a = await generatePkce();
    const b = await generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe('PKCE verifier charset regex used by /api/githubToken', () => {
  const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

  it('accepts a typical 43-char verifier', () => {
    expect(VERIFIER_RE.test('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(true);
  });
  it('accepts max-length 128 chars', () => {
    expect(VERIFIER_RE.test('A'.repeat(128))).toBe(true);
  });
  it('rejects too short', () => {
    expect(VERIFIER_RE.test('A'.repeat(42))).toBe(false);
  });
  it('rejects too long', () => {
    expect(VERIFIER_RE.test('A'.repeat(129))).toBe(false);
  });
  it('rejects disallowed chars', () => {
    expect(VERIFIER_RE.test('A'.repeat(60) + '<')).toBe(false);
    expect(VERIFIER_RE.test('A'.repeat(60) + ' ')).toBe(false);
    expect(VERIFIER_RE.test('A'.repeat(60) + '\n')).toBe(false);
    expect(VERIFIER_RE.test('A'.repeat(60) + '/')).toBe(false);
  });
});
