import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import yaml from 'js-yaml';
import type { Dependency } from './types.js';

const LOCKFILE_NAMES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'] as const;

export function detectLockfile(dir: string): string {
  for (const name of LOCKFILE_NAMES) {
    const filePath = join(dir, name);
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  throw new Error(`No lockfile found in ${dir}. Looked for: ${LOCKFILE_NAMES.join(', ')}`);
}

export function parseLockfile(filePath: string): Dependency[] {
  const content = readFileSync(filePath, 'utf-8');
  const filename = basename(filePath);

  switch (filename) {
    case 'package-lock.json':
      return parsePackageLock(content);
    case 'yarn.lock':
      return parseYarnLock(content);
    case 'pnpm-lock.yaml':
      return parsePnpmLock(content);
    default:
      throw new Error(`Unsupported lockfile: ${filename}`);
  }
}

export function parsePackageLock(content: string): Dependency[] {
  const lock = JSON.parse(content);
  const packages: Record<string, unknown> = lock.packages ?? {};
  const seen = new Set<string>();
  const deps: Dependency[] = [];

  for (const [key, value] of Object.entries(packages)) {
    if (key === '') continue; // skip root
    const pkg = value as Record<string, unknown>;

    // Extract name: "node_modules/foo" → "foo", "node_modules/@scope/bar" → "@scope/bar"
    // Nested: "node_modules/foo/node_modules/bar" → "bar"
    const segments = key.split('node_modules/');
    const name = segments[segments.length - 1];
    if (!name) continue;

    const version = (pkg.version as string) ?? '';
    const dedupKey = `${name}@${version}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const isDev = !!(pkg.dev || pkg.devOptional);

    deps.push({ name, version, isDev });
  }

  return deps;
}

export function parseYarnLock(content: string, packageJsonContent?: string): Dependency[] {
  const devDeps = new Set<string>();
  if (packageJsonContent) {
    try {
      const pkg = JSON.parse(packageJsonContent);
      if (pkg.devDependencies) {
        for (const name of Object.keys(pkg.devDependencies)) {
          devDeps.add(name);
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  const seen = new Set<string>();
  const deps: Dependency[] = [];
  const lines = content.split('\n');

  let currentName = '';
  let currentVersion = '';

  for (const line of lines) {
    // Block headers look like: "pkg@^1.0.0": or pkg@^1.0.0, "pkg@^2.0.0":
    // or "@scope/pkg@^1.0.0":
    if (!line.startsWith(' ') && !line.startsWith('#') && line.includes('@') && line.endsWith(':')) {
      // Extract package name from the header
      const header = line.replace(/"/g, '').replace(/:$/, '');
      // Take the first entry before any comma
      const firstEntry = header.split(',')[0].trim();
      // Name is everything before the last @
      const lastAt = firstEntry.lastIndexOf('@');
      if (lastAt > 0) {
        currentName = firstEntry.substring(0, lastAt);
      }
      currentVersion = '';
    } else if (line.startsWith('  version ')) {
      // version "1.2.3"
      currentVersion = line.replace(/^\s+version\s+"?/, '').replace(/"?\s*$/, '');

      if (currentName && currentVersion) {
        const dedupKey = `${currentName}@${currentVersion}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          deps.push({
            name: currentName,
            version: currentVersion,
            isDev: devDeps.has(currentName),
          });
        }
      }
    }
  }

  return deps;
}

export function parsePnpmLock(content: string): Dependency[] {
  const lock = yaml.load(content) as Record<string, unknown>;
  const packages = (lock.packages ?? {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const deps: Dependency[] = [];

  for (const [key, value] of Object.entries(packages)) {
    const pkg = (value ?? {}) as Record<string, unknown>;

    let name: string;
    let version: string;

    // v6+ format: /@scope/name@version or /name@version
    // v5 format: /@scope/name/version or /name/version
    const stripped = key.startsWith('/') ? key.substring(1) : key;

    if (stripped.startsWith('@')) {
      // Scoped package
      // v6+: @scope/name@version
      const atIdx = stripped.indexOf('@', 1);
      if (atIdx === -1) {
        // v5: @scope/name/version — find the last /
        const lastSlash = stripped.lastIndexOf('/');
        if (lastSlash <= 0) continue;
        name = stripped.substring(0, lastSlash);
        version = stripped.substring(lastSlash + 1);
      } else {
        // Check if it's @ for version or part of scope
        const slashIdx = stripped.indexOf('/');
        if (atIdx > slashIdx) {
          // v6+: @scope/name@version
          name = stripped.substring(0, atIdx);
          version = stripped.substring(atIdx + 1);
        } else {
          // Unusual format, try last /
          const lastSlash = stripped.lastIndexOf('/');
          name = stripped.substring(0, lastSlash);
          version = stripped.substring(lastSlash + 1);
        }
      }
    } else {
      // Unscoped package
      const atIdx = stripped.indexOf('@');
      if (atIdx !== -1) {
        // v6+: name@version
        name = stripped.substring(0, atIdx);
        version = stripped.substring(atIdx + 1);
      } else {
        // v5: name/version
        const slashIdx = stripped.indexOf('/');
        if (slashIdx === -1) continue;
        name = stripped.substring(0, slashIdx);
        version = stripped.substring(slashIdx + 1);
      }
    }

    // Strip any trailing parenthesized peer dep info from version
    version = version.replace(/\(.*\)$/, '');

    if (!name || !version) continue;

    const dedupKey = `${name}@${version}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const isDev = !!(pkg.dev);

    deps.push({ name, version, isDev });
  }

  return deps;
}
