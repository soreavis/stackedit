// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const appHtml = fs.readFileSync(
  path.resolve(__dirname, '../../../index.html'), 'utf8',
);
const landingHtml = fs.readFileSync(
  path.resolve(__dirname, '../../../static/landing/index.html'), 'utf8',
);

describe('index.html (app shell)', () => {
  it('has a robots meta blocking indexing of the app', () => {
    expect(appHtml).toMatch(/<meta[^>]+name=["']robots["'][^>]+noindex/);
    expect(appHtml).toMatch(/nofollow/);
    expect(appHtml).toMatch(/noarchive/);
    expect(appHtml).toMatch(/nosnippet/);
  });
});

describe('static/landing/index.html', () => {
  it('does not reference the deprecated AppCache manifest', () => {
    expect(landingHtml).not.toMatch(/manifest=["']cache\.manifest["']/);
  });

  it('does not pull in third-party https://stackedit.io/style.css', () => {
    expect(landingHtml).not.toContain('https://stackedit.io/style.css');
  });
});
