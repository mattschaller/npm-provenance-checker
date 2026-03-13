import { describe, it, expect } from 'vitest';
import { formatText, formatJson, formatHtml, formatGitHubActions } from '../src/reporter.js';
import type { CheckResult } from '../src/types.js';

const sampleResult: CheckResult = {
  dependencies: [
    { name: 'express', version: '4.18.2', isDev: false, status: 'attested', predicateType: 'https://slsa.dev/provenance/v1' },
    { name: 'lodash', version: '4.17.21', isDev: false, status: 'signed-only' },
    { name: 'old-pkg', version: '0.1.0', isDev: false, status: 'unattested' },
    { name: 'typescript', version: '5.5.0', isDev: true, status: 'attested' },
  ],
  summary: {
    total: 4,
    prod: 3,
    dev: 1,
    attested: 2,
    signedOnly: 1,
    unattested: 1,
    prodAttested: 1,
    prodTotal: 3,
    score: 33,
  },
};

describe('formatText', () => {
  it('includes score', () => {
    const output = formatText(sampleResult);
    expect(output).toContain('Provenance Score: 33/100');
  });

  it('includes status lines for each dependency', () => {
    const output = formatText(sampleResult);
    expect(output).toContain('express@4.18.2');
    expect(output).toContain('lodash@4.17.21');
    expect(output).toContain('old-pkg@0.1.0');
    expect(output).toContain('attested');
    expect(output).toContain('unattested');
  });
});

describe('formatJson', () => {
  it('produces valid JSON', () => {
    const output = formatJson(sampleResult);
    const parsed = JSON.parse(output);
    expect(parsed.summary.score).toBe(33);
    expect(parsed.dependencies).toHaveLength(4);
  });
});

describe('formatHtml', () => {
  it('contains table element', () => {
    const output = formatHtml(sampleResult);
    expect(output).toContain('<table');
    expect(output).toContain('</table>');
  });

  it('contains score', () => {
    const output = formatHtml(sampleResult);
    expect(output).toContain('33/100');
  });
});

describe('formatGitHubActions', () => {
  it('emits error annotations for unattested prod deps', () => {
    const output = formatGitHubActions(sampleResult);
    expect(output).toContain('::error::old-pkg@0.1.0 has no provenance attestation');
  });

  it('emits warning annotations for signed-only prod deps', () => {
    const output = formatGitHubActions(sampleResult);
    expect(output).toContain('::warning::lodash@4.17.21 is signed but lacks provenance attestation');
  });
});
