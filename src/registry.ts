import type { Dependency, DependencyResult, AttestationStatus } from './types.js';

const REGISTRY_BASE = 'https://registry.npmjs.org';
const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;

function encodePackageName(name: string): string {
  if (name.startsWith('@')) {
    return `@${encodeURIComponent(name.substring(1))}`;
  }
  return encodeURIComponent(name);
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

export async function fetchAttestation(name: string, version: string): Promise<DependencyResult> {
  const url = `${REGISTRY_BASE}/${encodePackageName(name)}/${version}`;
  let status: AttestationStatus = 'unattested';
  let predicateType: string | undefined;

  try {
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      return { name, version, isDev: false, status: 'unattested' };
    }

    const data = await response.json() as Record<string, unknown>;
    const dist = data.dist as Record<string, unknown> | undefined;

    if (dist) {
      const attestations = dist.attestations as Record<string, unknown> | undefined;
      if (attestations) {
        const provenance = attestations.provenance as Record<string, unknown> | undefined;
        if (provenance?.predicateType) {
          status = 'attested';
          predicateType = provenance.predicateType as string;
        }
      }

      if (status === 'unattested') {
        const signatures = dist.signatures as unknown[];
        if (Array.isArray(signatures) && signatures.length > 0) {
          status = 'signed-only';
        }
      }
    }
  } catch {
    // Network errors → treat as unattested
    return { name, version, isDev: false, status: 'unattested' };
  }

  const result: DependencyResult = { name, version, isDev: false, status };
  if (predicateType) result.predicateType = predicateType;
  return result;
}

export async function fetchAllAttestations(
  deps: Dependency[],
  options: { concurrency?: number } = {},
): Promise<DependencyResult[]> {
  const concurrency = options.concurrency ?? 20;

  // Deduplicate by name@version
  const seen = new Map<string, Dependency>();
  for (const dep of deps) {
    const key = `${dep.name}@${dep.version}`;
    if (!seen.has(key)) {
      seen.set(key, dep);
    }
  }

  const uniqueDeps = [...seen.values()];
  const results: DependencyResult[] = [];

  // Process in batches
  for (let i = 0; i < uniqueDeps.length; i += concurrency) {
    const batch = uniqueDeps.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (dep) => {
        const result = await fetchAttestation(dep.name, dep.version);
        result.isDev = dep.isDev;
        return result;
      }),
    );
    results.push(...batchResults);
  }

  return results;
}
