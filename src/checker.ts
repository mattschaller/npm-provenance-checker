import type { DependencyResult, CheckResult } from './types.js';

export function computeResults(results: DependencyResult[], options: { prodOnly?: boolean } = {}): CheckResult {
  const deps = options.prodOnly ? results.filter(d => !d.isDev) : results;

  const prodDeps = deps.filter(d => !d.isDev);
  const devDeps = deps.filter(d => d.isDev);

  const attested = deps.filter(d => d.status === 'attested');
  const signedOnly = deps.filter(d => d.status === 'signed-only');
  const unattested = deps.filter(d => d.status === 'unattested');

  const prodAttested = prodDeps.filter(d => d.status === 'attested').length;
  const prodTotal = prodDeps.length;

  const score = prodTotal === 0 ? 100 : Math.round((prodAttested / prodTotal) * 100);

  return {
    dependencies: deps,
    summary: {
      total: deps.length,
      prod: prodDeps.length,
      dev: devDeps.length,
      attested: attested.length,
      signedOnly: signedOnly.length,
      unattested: unattested.length,
      prodAttested,
      prodTotal,
      score,
    },
  };
}
