import { describe, it, expect } from 'vitest';
import '../../../src/libs/clunderscore.js';

describe('clunderscore — Array prototype extensions', () => {
  it('cl_each iterates over every element', () => {
    const seen = [];
    [1, 2, 3].cl_each(v => seen.push(v));
    expect(seen).toEqual([1, 2, 3]);
  });

  it('cl_map maps values', () => {
    expect([1, 2, 3].cl_map(v => v * 2)).toEqual([2, 4, 6]);
  });

  it('cl_filter filters values', () => {
    expect([1, 2, 3, 4].cl_filter(v => v % 2 === 0)).toEqual([2, 4]);
  });

  it('cl_reduce accumulates', () => {
    expect([1, 2, 3].cl_reduce((a, b) => a + b, 0)).toBe(6);
  });

  it('cl_some returns true when any predicate matches', () => {
    expect([1, 2, 3].cl_some(v => v === 2)).toBe(true);
    expect([1, 2, 3].cl_some(v => v === 99)).toBeFalsy();
  });
});

describe('clunderscore — typed array support (used by utils.uid)', () => {
  it('Uint32Array gets cl_map', () => {
    const arr = new Uint32Array([1, 2, 3]);
    expect(arr.cl_map(v => v + 10)).toEqual([11, 12, 13]);
  });
});

describe('clunderscore — Object prototype extensions', () => {
  it('cl_each iterates key/value pairs', () => {
    const seen = {};
    ({ a: 1, b: 2 }).cl_each((value, key) => { seen[key] = value; });
    expect(seen).toEqual({ a: 1, b: 2 });
  });

  it('cl_extend merges onto target', () => {
    const target = { a: 1 };
    target.cl_extend({ b: 2 });
    expect(target).toEqual({ a: 1, b: 2 });
  });
});
