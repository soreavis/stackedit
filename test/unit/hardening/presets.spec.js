import { describe, it, expect } from 'vitest';
import presets from '../../../src/data/presets.js';

describe('data/presets', () => {
  it('exposes a default preset with a markdown extension config', () => {
    expect(presets.default).toBeTruthy();
    const [zero] = presets.default;
    expect(zero.markdown).toBeDefined();
    expect(typeof zero.markdown).toBe('object');
  });

  it('every preset is a tuple [baseConfig, override?]', () => {
    Object.values(presets).forEach((entry) => {
      expect(Array.isArray(entry)).toBe(true);
      expect(typeof entry[0]).toBe('object');
      if (entry[1] !== undefined) {
        expect(typeof entry[1]).toBe('object');
      }
    });
  });

  it('includes a commonmark preset distinct from default', () => {
    expect(presets.commonmark).toBeTruthy();
    expect(presets.commonmark).not.toBe(presets.default);
  });
});
