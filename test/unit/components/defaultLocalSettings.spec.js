// @vitest-environment node
import { describe, it, expect } from 'vitest';
import defaultLocalSettings from '../../../src/data/defaults/defaultLocalSettings.js';

describe('defaultLocalSettings', () => {
  it('returns a fresh object each call (so mutations do not leak)', () => {
    const a = defaultLocalSettings();
    const b = defaultLocalSettings();
    expect(a).not.toBe(b);
    a.filePropertiesTab = 'simple';
    expect(b.filePropertiesTab).not.toBe('simple');
  });

  it("defaults filePropertiesTab to 'yaml'", () => {
    // Independence-era choice: YAML opens by default; users who explicitly
    // pick Simple persist that. Regression check — earlier value was '',
    // which fell through to setSimpleTab on every modal open.
    expect(defaultLocalSettings().filePropertiesTab).toBe('yaml');
  });

  it("defaults explorerSort to 'name'", () => {
    expect(defaultLocalSettings().explorerSort).toBe('name');
  });

  it('exposes all known publish-template defaults', () => {
    const d = defaultLocalSettings();
    expect(d.googleDrivePublishTemplate).toBe('styledHtml');
    expect(d.dropboxPublishTemplate).toBe('styledHtml');
    expect(d.githubPublishTemplate).toBe('jekyllSite');
    expect(d.bloggerPublishTemplate).toBe('plainHtml');
    expect(d.wordpressPublishTemplate).toBe('plainHtml');
    expect(d.gistPublishTemplate).toBe('plainText');
    expect(d.gitlabPublishTemplate).toBe('plainText');
    expect(d.zendeskPublishTemplate).toBe('plainHtml');
  });
});
