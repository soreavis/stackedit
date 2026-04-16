import { describe, it, expect } from 'vitest';
import utils from '../../../src/services/utils.js';

describe('utils.parseQueryParams', () => {
  it('parses a simple key=value string', () => {
    expect(utils.parseQueryParams('a=1&b=2')).toEqual({ a: '1', b: '2' });
  });

  it('url-decodes keys and values', () => {
    expect(utils.parseQueryParams('name=hello%20world&city=New%20York'))
      .toEqual({ name: 'hello world', city: 'New York' });
  });

  it('drops params with missing value separator (key only, no =)', () => {
    expect(utils.parseQueryParams('a=1&onlyKey&c=3')).toEqual({ a: '1', c: '3' });
  });

  it('keeps keys with empty string values', () => {
    expect(utils.parseQueryParams('a=&b=1')).toEqual({ a: '', b: '1' });
  });

  it('returns {} for empty input', () => {
    expect(utils.parseQueryParams('')).toEqual({});
  });
});

describe('utils.sanitizeText', () => {
  it('always appends a single trailing newline', () => {
    expect(utils.sanitizeText('hello')).toBe('hello\n');
    expect(utils.sanitizeText('hello\n')).toBe('hello\n');
  });

  it('coerces undefined/null to ""', () => {
    expect(utils.sanitizeText(undefined)).toBe('\n');
    expect(utils.sanitizeText(null)).toBe('\n');
  });

  it('collapses an accidental double-newline to single', () => {
    expect(utils.sanitizeText('hello\n')).toBe('hello\n');
  });
});

describe('utils.sanitizeName', () => {
  it('clips to 250 chars', () => {
    const long = 'a'.repeat(400);
    expect(utils.sanitizeName(long).length).toBe(250);
  });

  it('falls back to defaultName for empty input', () => {
    expect(utils.sanitizeName('')).toBeTruthy();
    expect(utils.sanitizeName(null)).toBeTruthy();
  });
});

describe('utils.sanitizeFilename', () => {
  it('replaces slashes, control chars, and runs of whitespace with a single space', () => {
    expect(utils.sanitizeFilename('foo/bar\tbaz')).toBe('foo bar baz');
    expect(utils.sanitizeFilename('foo\x00bar')).toBe('foo bar');
    expect(utils.sanitizeFilename('foo   bar')).toBe('foo bar');
  });

  it('trims leading/trailing whitespace', () => {
    expect(utils.sanitizeFilename('   hello   ')).toBe('hello');
  });

  it('falls back to defaultName when everything is stripped', () => {
    expect(utils.sanitizeFilename('///')).toBeTruthy();
  });
});

describe('utils.deepCopy', () => {
  it('deep-clones a nested structure', () => {
    const src = { a: { b: [1, 2, { c: 3 }] } };
    const copy = utils.deepCopy(src);
    expect(copy).toEqual(src);
    expect(copy).not.toBe(src);
    expect(copy.a).not.toBe(src.a);
    expect(copy.a.b).not.toBe(src.a.b);
    expect(copy.a.b[2]).not.toBe(src.a.b[2]);
  });

  it('passes through null / undefined', () => {
    expect(utils.deepCopy(null)).toBeNull();
    expect(utils.deepCopy(undefined)).toBeUndefined();
  });
});

describe('utils.serializeObject', () => {
  it('produces the same string regardless of insertion order', () => {
    const a = utils.serializeObject({ a: 1, b: 2, c: { z: 1, y: 2 } });
    const b = utils.serializeObject({ c: { y: 2, z: 1 }, b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it('returns undefined for undefined input', () => {
    expect(utils.serializeObject(undefined)).toBeUndefined();
  });
});

describe('utils.hash + getItemHash + addItemHash', () => {
  it('returns 0 for empty input', () => {
    expect(utils.hash('')).toBe(0);
    expect(utils.hash(null)).toBe(0);
  });

  it('is deterministic for the same input', () => {
    expect(utils.hash('stackedit')).toBe(utils.hash('stackedit'));
  });

  it('differs for different inputs', () => {
    expect(utils.hash('a')).not.toBe(utils.hash('b'));
  });

  it('ignores id/hash/history when hashing items', () => {
    const a = { name: 'x', body: 'hi', id: 'a' };
    const b = { name: 'x', body: 'hi', id: 'b', hash: 999, history: [] };
    expect(utils.getItemHash(a)).toBe(utils.getItemHash(b));
  });

  it('addItemHash attaches a hash field', () => {
    const item = utils.addItemHash({ name: 'x' });
    expect(item.hash).toBe(utils.getItemHash({ name: 'x' }));
  });
});

describe('utils.makeWorkspaceId + getDbName', () => {
  it('makeWorkspaceId is deterministic for identical params', () => {
    expect(utils.makeWorkspaceId({ x: 1 })).toBe(utils.makeWorkspaceId({ x: 1 }));
  });

  it('differs for different params', () => {
    expect(utils.makeWorkspaceId({ x: 1 })).not.toBe(utils.makeWorkspaceId({ x: 2 }));
  });

  it('getDbName appends non-main workspaces', () => {
    expect(utils.getDbName('main')).toBe('stackedit-db');
    expect(utils.getDbName('abc123')).toBe('stackedit-db-abc123');
  });
});

describe('utils.encodeBase64 + decodeBase64', () => {
  it('round-trips ASCII strings', () => {
    const s = 'hello world';
    expect(utils.decodeBase64(utils.encodeBase64(s))).toBe(s);
  });

  it('round-trips unicode strings', () => {
    const s = 'héllo — world 😀';
    expect(utils.decodeBase64(utils.encodeBase64(s))).toBe(s);
  });

  it('urlSafe=true produces a URL-safe alphabet', () => {
    const s = '??>>??'; // Likely to yield + / = in plain base64
    const urlSafe = utils.encodeBase64(s, true);
    expect(urlSafe).not.toMatch(/[+/=]/);
  });

  it('decodeBase64 accepts URL-safe input', () => {
    const s = 'héllo';
    const urlSafe = utils.encodeBase64(s, true);
    expect(utils.decodeBase64(urlSafe)).toBe(s);
  });
});

describe('utils.addQueryParams', () => {
  it('adds to the search component by default', () => {
    expect(utils.addQueryParams('http://x.test/p', { a: '1', b: '2' }))
      .toMatch(/\?a=1&b=2/);
  });

  it('adds to the hash when hash=true', () => {
    expect(utils.addQueryParams('http://x.test/p', { a: '1' }, true))
      .toMatch(/#a=1/);
  });

  it('adds no query string when every param is nullish', () => {
    const out = utils.addQueryParams('http://x.test/p', { a: null, b: undefined });
    expect(out).not.toContain('?');
    expect(out).toContain('http://x.test/p');
  });

  it('url-encodes both keys and values', () => {
    expect(utils.addQueryParams('http://x.test/', { 'k y': 'v/z' }))
      .toMatch(/\?k%20y=v%2Fz/);
  });
});

describe('utils URL helpers', () => {
  it('getHostname extracts host from URL', () => {
    expect(utils.getHostname('https://example.com:8080/path')).toBe('example.com');
  });

  it('encodeUrlPath encodes each segment separately', () => {
    expect(utils.encodeUrlPath('foo/bar baz/qux%')).toBe('foo/bar%20baz/qux%25');
  });

  it('encodeUrlPath returns "" for empty input', () => {
    expect(utils.encodeUrlPath('')).toBe('');
  });
});

describe('utils.parseGithubRepoUrl', () => {
  it('parses https URLs with .git', () => {
    expect(utils.parseGithubRepoUrl('https://github.com/benweet/stackedit.git'))
      .toEqual({ owner: 'benweet', repo: 'stackedit' });
  });

  it('parses https URLs without .git', () => {
    expect(utils.parseGithubRepoUrl('https://github.com/benweet/stackedit'))
      .toEqual({ owner: 'benweet', repo: 'stackedit' });
  });

  it('parses ssh-style URLs', () => {
    expect(utils.parseGithubRepoUrl('git@github.com:benweet/stackedit.git'))
      .toEqual({ owner: 'benweet', repo: 'stackedit' });
  });

  it('returns null for garbage', () => {
    expect(utils.parseGithubRepoUrl('not a url')).toBeFalsy();
    expect(utils.parseGithubRepoUrl('')).toBeFalsy();
  });
});

describe('utils.parseGitlabProjectPath', () => {
  it('extracts the group/project path', () => {
    expect(utils.parseGitlabProjectPath('https://gitlab.com/group/project.git'))
      .toBe('group/project');
  });

  it('handles nested groups', () => {
    expect(utils.parseGitlabProjectPath('https://gitlab.example.com/a/b/c'))
      .toBe('a/b/c');
  });

  it('returns falsy for non-https', () => {
    expect(utils.parseGitlabProjectPath('http://x/y')).toBeFalsy();
  });
});

describe('utils.computeProperties', () => {
  it('returns default preset on empty input', () => {
    const result = utils.computeProperties('');
    expect(result.extensions).toBeDefined();
    expect(result.extensions.markdown).toBeDefined();
  });

  it('overrides extensions via YAML front-matter', () => {
    const yaml = 'extensions:\n  markdown:\n    breaks: true\n';
    const result = utils.computeProperties(yaml);
    expect(result.extensions.markdown.breaks).toBe(true);
  });

  it('does not throw on malformed YAML', () => {
    expect(() => utils.computeProperties('not: [valid')).not.toThrow();
  });
});

describe('utils.search + someResult', () => {
  it('search returns the first item matching all criteria keys', () => {
    const items = [{ a: 1, b: 2 }, { a: 1, b: 3 }];
    expect(utils.search(items, { a: 1, b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it('search returns undefined when nothing matches', () => {
    expect(utils.search([{ a: 1 }], { a: 2 })).toBeUndefined();
  });

  it('someResult returns the first truthy callback result', () => {
    expect(utils.someResult([1, 2, 3, 4], v => (v > 2 ? v * 10 : undefined))).toBe(30);
  });

  it('someResult returns undefined when nothing truthy', () => {
    expect(utils.someResult([1, 2], () => undefined)).toBeUndefined();
  });
});

describe('utils.uid', () => {
  it('produces a 16-char token from the configured alphabet', () => {
    const id = utils.uid();
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-zA-Z]{16}$/);
  });

  it('is not trivially repeatable', () => {
    const ids = new Set(Array.from({ length: 20 }, () => utils.uid()));
    expect(ids.size).toBe(20);
  });
});
