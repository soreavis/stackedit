import { describe, it, expect } from 'vitest';
import htmlSanitizer from '../../../src/libs/htmlSanitizer.js';

const { sanitizeHtml, sanitizeUri } = htmlSanitizer;

describe('htmlSanitizer.sanitizeHtml — basic markup preservation', () => {
  it('preserves plain markdown-like HTML', () => {
    const out = sanitizeHtml('<p><strong>hi</strong> <em>there</em></p>');
    expect(out).toContain('<strong>hi</strong>');
    expect(out).toContain('<em>there</em>');
  });

  it('preserves headings, lists, tables, blockquotes', () => {
    const out = sanitizeHtml(
      '<h2>t</h2><ul><li>a</li></ul><table><tr><td>c</td></tr></table><blockquote>q</blockquote>',
    );
    expect(out).toContain('<h2>t</h2>');
    expect(out).toContain('<li>a</li>');
    expect(out).toContain('<td>c</td>');
    expect(out).toContain('<blockquote>q</blockquote>');
  });

  it('preserves svg elements in the allowlist', () => {
    const out = sanitizeHtml('<svg><circle cx="5" cy="5" r="2"/></svg>');
    expect(out).toContain('<svg');
    expect(out).toContain('<circle');
  });

  it('preserves img with http src', () => {
    const out = sanitizeHtml('<img src="https://example.com/x.png" alt="x">');
    expect(out).toContain('src="https://example.com/x.png"');
  });
});

describe('htmlSanitizer.sanitizeHtml — XSS neutralization', () => {
  it('strips script tags entirely', () => {
    const out = sanitizeHtml('hello<script>alert(1)</script>world');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('strips onerror/onload/onclick on arbitrary elements', () => {
    const out = sanitizeHtml(
      '<img src=x onerror="alert(1)"><div onclick="alert(2)" onmouseover="alert(3)">x</div>',
    );
    expect(out.toLowerCase()).not.toContain('onerror');
    expect(out.toLowerCase()).not.toContain('onclick');
    expect(out.toLowerCase()).not.toContain('onmouseover');
    expect(out.toLowerCase()).not.toContain('alert');
  });

  it('strips javascript: URIs on anchors', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('strips javascript: URIs in data: HTML', () => {
    const out = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(out.toLowerCase()).not.toContain('<script');
    expect(out.toLowerCase()).not.toContain('text/html');
  });

  it('strips style tags and inline <style>', () => {
    const out = sanitizeHtml('<style>body{background:red}</style><p>x</p>');
    expect(out).not.toContain('<style');
    expect(out).toContain('<p>x</p>');
  });

  it('strips svg onload', () => {
    const out = sanitizeHtml('<svg onload="alert(1)"><circle r=5/></svg>');
    expect(out.toLowerCase()).not.toContain('onload');
  });

  it('neutralizes svg <animate> href-to-javascript attack', () => {
    const out = sanitizeHtml('<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('defangs mXSS attempts that mix <style> inside <svg>', () => {
    const out = sanitizeHtml('<svg><style><img src=x onerror=alert(1)></style></svg>');
    expect(out.toLowerCase()).not.toContain('onerror');
    expect(out.toLowerCase()).not.toContain('alert');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('htmlSanitizer — target=_blank and iframe hooks', () => {
  it('adds rel="noopener noreferrer" to target="_blank" anchors', () => {
    const out = sanitizeHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toMatch(/rel="noopener noreferrer"/);
  });

  it('does NOT add rel when target is not _blank', () => {
    const out = sanitizeHtml('<a href="https://example.com">x</a>');
    expect(out).not.toMatch(/rel="noopener noreferrer"/);
  });

  it('sandboxes iframes and sets a strict referrerpolicy', () => {
    // No src — happy-dom otherwise tries to navigate the iframe during teardown
    // and the async abort races with Vitest worker shutdown. Behavior is the
    // same: the DOMPurify afterSanitizeAttributes hook runs regardless.
    const out = sanitizeHtml('<iframe></iframe>');
    expect(out).toContain('<iframe');
    expect(out).toContain('sandbox=');
    expect(out).toContain('referrerpolicy="no-referrer"');
  });
});

describe('htmlSanitizer.sanitizeUri', () => {
  it('accepts http/https/mailto/tel URIs', () => {
    expect(sanitizeUri('https://example.com', false)).toBe('https://example.com');
    expect(sanitizeUri('http://example.com', false)).toBe('http://example.com');
    expect(sanitizeUri('mailto:a@b.com', false)).toBe('mailto:a@b.com');
    expect(sanitizeUri('tel:+123', false)).toBe('tel:+123');
  });

  it('marks javascript: URIs unsafe for anchors', () => {
    const result = sanitizeUri('javascript:alert(1)', false);
    expect(result.startsWith('unsafe:')).toBe(true);
  });

  it('allows data:image/* URIs for images', () => {
    const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    expect(sanitizeUri(gif, true)).toBe(gif);
  });

  it('marks data:text/html unsafe for images', () => {
    const bad = 'data:text/html,<script>alert(1)</script>';
    expect(sanitizeUri(bad, true).startsWith('unsafe:')).toBe(true);
  });
});
