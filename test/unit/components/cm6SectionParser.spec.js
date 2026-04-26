import { describe, it, expect, beforeAll } from 'vitest';
import markdownConversionSvc from '../../../src/services/markdownConversionSvc';
import { parseSectionsForCm6 } from '../../../src/services/editor/cm6/cm6SectionParser';

describe('cm6SectionParser (Stage 3 batch 2 bridge)', () => {
  let converter;

  beforeAll(() => {
    markdownConversionSvc.init();
    converter = markdownConversionSvc.defaultConverter;
  });

  it('returns [] when no converter is supplied', () => {
    expect(parseSectionsForCm6(null, 'anything')).toEqual([]);
    expect(parseSectionsForCm6(undefined, 'anything')).toEqual([]);
  });

  it('returns at least one section for non-empty prose', () => {
    const sections = parseSectionsForCm6(converter, 'just some prose\nstill prose\n');
    expect(sections.length).toBeGreaterThanOrEqual(1);
    sections.forEach((s) => {
      expect(typeof s.text).toBe('string');
      expect(typeof s.data).toBe('string');
    });
  });

  it('preserves the full input across section.text concatenation', () => {
    const md = '# h1\n\npara\n\n# h2\n\nbody\n';
    const sections = parseSectionsForCm6(converter, md);
    const reconstructed = sections.map(s => s.text).join('');
    expect(reconstructed).toBe(md);
  });

  it('matches markdownConversionSvc.parseSections section-by-section exactly', () => {
    const inputs = [
      'plain prose\nmore prose\n',
      '# heading\n\nbody\n',
      '## h2\n\np1\n\n# h1\n\np2\n',
      'lead\n\n- a\n- b\n- c\n',
      'lead\n\n> quoted\n> still quoted\n',
      '',
    ];
    inputs.forEach((md) => {
      const direct = markdownConversionSvc.parseSections(converter, md).sections;
      const viaBridge = parseSectionsForCm6(converter, md);
      expect(viaBridge).toHaveLength(direct.length);
      viaBridge.forEach((entry, i) => {
        expect(entry.data).toBe(direct[i].data);
        expect(entry.text).toBe(direct[i].text);
      });
    });
  });
});
