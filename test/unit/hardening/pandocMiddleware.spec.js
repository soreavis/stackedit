// @vitest-environment node
import { describe, it, expect } from 'vitest';

// Mirror of the regex in dev-server/pandocMiddleware.js — kept in sync manually.
// If that regex changes, update here too.
const metaKeyRe = /^[A-Za-z0-9_-]{1,64}$/;

describe('dev-server pandoc metadata key validation', () => {
  it('accepts alphanumeric, underscore, and hyphen within 1-64 chars', () => {
    expect(metaKeyRe.test('title')).toBe(true);
    expect(metaKeyRe.test('author_name')).toBe(true);
    expect(metaKeyRe.test('some-key-123')).toBe(true);
    expect(metaKeyRe.test('a'.repeat(64))).toBe(true);
  });

  it('rejects empty / too-long keys', () => {
    expect(metaKeyRe.test('')).toBe(false);
    expect(metaKeyRe.test('a'.repeat(65))).toBe(false);
  });

  it('rejects keys with disallowed characters', () => {
    expect(metaKeyRe.test('foo=bar')).toBe(false);
    expect(metaKeyRe.test('foo;ls')).toBe(false);
    expect(metaKeyRe.test('foo\nbar')).toBe(false);
    expect(metaKeyRe.test('foo bar')).toBe(false);
    expect(metaKeyRe.test('foo.bar')).toBe(false);
  });
});

describe('dev-server pandoc value sanitization contract', () => {
  // Mirror: String(v).replace(/[\r\n]+/g, ' ')
  const sanitizeValue = v => String(v).replace(/[\r\n]+/g, ' ');

  it('strips CR/LF injections from values', () => {
    expect(sanitizeValue('foo\ninjected: bar')).toBe('foo injected: bar');
    expect(sanitizeValue('foo\r\nbar')).toBe('foo bar');
    expect(sanitizeValue('a\r\n\r\nb')).toBe('a b');
  });

  it('leaves safe values unchanged', () => {
    expect(sanitizeValue('plain text')).toBe('plain text');
    expect(sanitizeValue('with: punctuation & quotes')).toBe('with: punctuation & quotes');
  });

  it('coerces non-strings', () => {
    expect(sanitizeValue(42)).toBe('42');
    expect(sanitizeValue(true)).toBe('true');
    expect(sanitizeValue(null)).toBe('null');
  });
});
