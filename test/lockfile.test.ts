import { describe, it, expect } from 'vitest';
import { parsePackageLock, parseYarnLock, parsePnpmLock } from '../src/lockfile.js';

describe('parsePackageLock', () => {
  it('parses v3 lockfile with packages', () => {
    const content = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'my-app', version: '1.0.0' },
        'node_modules/express': { version: '4.18.2' },
        'node_modules/lodash': { version: '4.17.21' },
      },
    });
    const deps = parsePackageLock(content);
    expect(deps).toHaveLength(2);
    expect(deps.find(d => d.name === 'express')).toEqual({ name: 'express', version: '4.18.2', isDev: false });
    expect(deps.find(d => d.name === 'lodash')).toEqual({ name: 'lodash', version: '4.17.21', isDev: false });
  });

  it('skips root entry', () => {
    const content = JSON.stringify({
      packages: {
        '': { name: 'root', version: '0.0.0' },
        'node_modules/foo': { version: '1.0.0' },
      },
    });
    const deps = parsePackageLock(content);
    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe('foo');
  });

  it('parses scoped packages', () => {
    const content = JSON.stringify({
      packages: {
        '': {},
        'node_modules/@types/node': { version: '20.0.0', dev: true },
      },
    });
    const deps = parsePackageLock(content);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toEqual({ name: '@types/node', version: '20.0.0', isDev: true });
  });

  it('handles nested node_modules', () => {
    const content = JSON.stringify({
      packages: {
        '': {},
        'node_modules/a': { version: '1.0.0' },
        'node_modules/a/node_modules/b': { version: '2.0.0' },
      },
    });
    const deps = parsePackageLock(content);
    expect(deps).toHaveLength(2);
    expect(deps.find(d => d.name === 'b')).toBeTruthy();
  });

  it('deduplicates by name@version', () => {
    const content = JSON.stringify({
      packages: {
        '': {},
        'node_modules/foo': { version: '1.0.0' },
        'node_modules/bar/node_modules/foo': { version: '1.0.0' },
      },
    });
    const deps = parsePackageLock(content);
    const foos = deps.filter(d => d.name === 'foo');
    expect(foos).toHaveLength(1);
  });

  it('returns empty for lockfile with no deps', () => {
    const content = JSON.stringify({ packages: { '': {} } });
    const deps = parsePackageLock(content);
    expect(deps).toHaveLength(0);
  });

  it('marks devOptional as dev', () => {
    const content = JSON.stringify({
      packages: {
        '': {},
        'node_modules/fsevents': { version: '2.0.0', devOptional: true },
      },
    });
    const deps = parsePackageLock(content);
    expect(deps[0].isDev).toBe(true);
  });
});

describe('parseYarnLock', () => {
  it('parses basic yarn.lock', () => {
    const content = `# yarn lockfile v1

express@^4.18.0:
  version "4.18.2"
  resolved "https://registry.yarnpkg.com/express/-/express-4.18.2.tgz"

lodash@^4.17.0:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"
`;
    const deps = parseYarnLock(content);
    expect(deps).toHaveLength(2);
    expect(deps.find(d => d.name === 'express')?.version).toBe('4.18.2');
  });

  it('parses scoped packages', () => {
    const content = `"@types/node@^20.0.0":
  version "20.0.0"
  resolved "https://registry.yarnpkg.com/@types/node/-/node-20.0.0.tgz"
`;
    const deps = parseYarnLock(content);
    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe('@types/node');
    expect(deps[0].version).toBe('20.0.0');
  });

  it('classifies dev dependencies using package.json', () => {
    const content = `typescript@^5.0.0:
  version "5.5.0"
  resolved "https://registry.yarnpkg.com/typescript/-/typescript-5.5.0.tgz"

express@^4.0.0:
  version "4.18.2"
  resolved "https://registry.yarnpkg.com/express/-/express-4.18.2.tgz"
`;
    const packageJson = JSON.stringify({
      dependencies: { express: '^4.0.0' },
      devDependencies: { typescript: '^5.0.0' },
    });
    const deps = parseYarnLock(content, packageJson);
    expect(deps.find(d => d.name === 'typescript')?.isDev).toBe(true);
    expect(deps.find(d => d.name === 'express')?.isDev).toBe(false);
  });
});

describe('parsePnpmLock', () => {
  it('parses v6+ format with @ version separator', () => {
    const content = `lockfileVersion: '6.0'
packages:
  /express@4.18.2:
    dev: false
  /lodash@4.17.21:
    dev: false
`;
    const deps = parsePnpmLock(content);
    expect(deps).toHaveLength(2);
    expect(deps.find(d => d.name === 'express')?.version).toBe('4.18.2');
  });

  it('parses scoped packages in v6+ format', () => {
    const content = `lockfileVersion: '6.0'
packages:
  /@types/node@20.0.0:
    dev: true
`;
    const deps = parsePnpmLock(content);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toEqual({ name: '@types/node', version: '20.0.0', isDev: true });
  });

  it('returns empty for lockfile with no packages', () => {
    const content = `lockfileVersion: '6.0'
packages: {}
`;
    const deps = parsePnpmLock(content);
    expect(deps).toHaveLength(0);
  });
});
