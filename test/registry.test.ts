import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAttestation, fetchAllAttestations } from '../src/registry.js';

describe('fetchAttestation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('detects attested packages', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        dist: {
          attestations: {
            provenance: {
              predicateType: 'https://slsa.dev/provenance/v1',
            },
          },
        },
      }),
    }) as unknown as typeof fetch;

    const result = await fetchAttestation('express', '4.18.2');
    expect(result.status).toBe('attested');
    expect(result.predicateType).toBe('https://slsa.dev/provenance/v1');
  });

  it('detects signed-only packages', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        dist: {
          signatures: [{ keyid: 'abc', sig: 'def' }],
        },
      }),
    }) as unknown as typeof fetch;

    const result = await fetchAttestation('lodash', '4.17.21');
    expect(result.status).toBe('signed-only');
  });

  it('detects unattested packages', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        dist: {},
      }),
    }) as unknown as typeof fetch;

    const result = await fetchAttestation('old-pkg', '0.1.0');
    expect(result.status).toBe('unattested');
  });

  it('handles 404 as unattested', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    const result = await fetchAttestation('nonexistent', '0.0.0');
    expect(result.status).toBe('unattested');
  });

  it('handles network errors as unattested', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const result = await fetchAttestation('some-pkg', '1.0.0');
    expect(result.status).toBe('unattested');
  });

  it('encodes scoped package names in URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ dist: {} }),
    }) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    await fetchAttestation('@types/node', '20.0.0');
    const calledUrl = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toContain('@types%2Fnode');
  });
});

describe('fetchAllAttestations', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('deduplicates dependencies by name@version', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ dist: {} }),
    }) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    const deps = [
      { name: 'foo', version: '1.0.0', isDev: false },
      { name: 'foo', version: '1.0.0', isDev: true },
      { name: 'bar', version: '2.0.0', isDev: false },
    ];

    const results = await fetchAllAttestations(deps, { concurrency: 10 });
    expect(results).toHaveLength(2);
    expect((mockFetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it('processes in batches respecting concurrency', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const mockFetch = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 10));
      concurrent--;
      return { ok: true, json: async () => ({ dist: {} }) };
    }) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    const deps = Array.from({ length: 5 }, (_, i) => ({
      name: `pkg-${i}`,
      version: '1.0.0',
      isDev: false,
    }));

    await fetchAllAttestations(deps, { concurrency: 2 });
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});
