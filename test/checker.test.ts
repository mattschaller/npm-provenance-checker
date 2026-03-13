import { describe, it, expect } from 'vitest';
import { computeResults } from '../src/checker.js';
import type { DependencyResult } from '../src/types.js';

function makeDep(overrides: Partial<DependencyResult> = {}): DependencyResult {
  return { name: 'pkg', version: '1.0.0', isDev: false, status: 'attested', ...overrides };
}

describe('computeResults', () => {
  it('computes correct score for mixed results', () => {
    const deps: DependencyResult[] = [
      makeDep({ name: 'a', status: 'attested' }),
      makeDep({ name: 'b', status: 'unattested' }),
      makeDep({ name: 'c', status: 'signed-only' }),
      makeDep({ name: 'd', status: 'attested' }),
    ];
    const result = computeResults(deps);
    expect(result.summary.score).toBe(50); // 2 attested out of 4 prod
  });

  it('returns 100 when all attested', () => {
    const deps: DependencyResult[] = [
      makeDep({ name: 'a', status: 'attested' }),
      makeDep({ name: 'b', status: 'attested' }),
    ];
    const result = computeResults(deps);
    expect(result.summary.score).toBe(100);
  });

  it('returns 0 when none attested', () => {
    const deps: DependencyResult[] = [
      makeDep({ name: 'a', status: 'unattested' }),
      makeDep({ name: 'b', status: 'signed-only' }),
    ];
    const result = computeResults(deps);
    expect(result.summary.score).toBe(0);
  });

  it('filters to prod-only when requested', () => {
    const deps: DependencyResult[] = [
      makeDep({ name: 'a', status: 'attested', isDev: false }),
      makeDep({ name: 'b', status: 'unattested', isDev: true }),
    ];
    const result = computeResults(deps, { prodOnly: true });
    expect(result.summary.total).toBe(1);
    expect(result.summary.score).toBe(100);
  });

  it('returns 100 for empty deps', () => {
    const result = computeResults([]);
    expect(result.summary.score).toBe(100);
    expect(result.summary.total).toBe(0);
  });

  it('counts signed-only separately', () => {
    const deps: DependencyResult[] = [
      makeDep({ name: 'a', status: 'attested' }),
      makeDep({ name: 'b', status: 'signed-only' }),
      makeDep({ name: 'c', status: 'unattested' }),
    ];
    const result = computeResults(deps);
    expect(result.summary.attested).toBe(1);
    expect(result.summary.signedOnly).toBe(1);
    expect(result.summary.unattested).toBe(1);
  });

  it('dev deps do not affect score', () => {
    const deps: DependencyResult[] = [
      makeDep({ name: 'a', status: 'attested', isDev: false }),
      makeDep({ name: 'b', status: 'unattested', isDev: true }),
      makeDep({ name: 'c', status: 'unattested', isDev: true }),
    ];
    const result = computeResults(deps);
    expect(result.summary.score).toBe(100); // only 1 prod dep, and it's attested
    expect(result.summary.prodAttested).toBe(1);
    expect(result.summary.prodTotal).toBe(1);
  });

  it('produces correct summary counts', () => {
    const deps: DependencyResult[] = [
      makeDep({ name: 'a', status: 'attested', isDev: false }),
      makeDep({ name: 'b', status: 'signed-only', isDev: false }),
      makeDep({ name: 'c', status: 'unattested', isDev: false }),
      makeDep({ name: 'd', status: 'attested', isDev: true }),
      makeDep({ name: 'e', status: 'unattested', isDev: true }),
    ];
    const result = computeResults(deps);
    expect(result.summary).toEqual({
      total: 5,
      prod: 3,
      dev: 2,
      attested: 2,
      signedOnly: 1,
      unattested: 2,
      prodAttested: 1,
      prodTotal: 3,
      score: 33,
    });
  });
});
