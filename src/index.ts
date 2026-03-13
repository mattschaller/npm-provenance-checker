import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { detectLockfile, parseLockfile } from './lockfile.js';
import { fetchAllAttestations } from './registry.js';
import { computeResults } from './checker.js';
import { formatText, formatJson, formatHtml, formatGitHubActions } from './reporter.js';
import type { CLIOptions, CheckResult } from './types.js';

export { detectLockfile, parseLockfile, parsePackageLock, parseYarnLock, parsePnpmLock } from './lockfile.js';
export { fetchAttestation, fetchAllAttestations } from './registry.js';
export { computeResults } from './checker.js';
export { formatText, formatJson, formatHtml, formatGitHubActions } from './reporter.js';
export type { Dependency, AttestationStatus, DependencyResult, CheckResult, CLIOptions } from './types.js';

const VERSION = '0.1.0';

function printHelp(): void {
  console.log(`npm-provenance-checker v${VERSION} — Batch-verify npm provenance attestations.

Usage: npm-provenance-checker [options]

Options:
  --lockfile <path>     path to lockfile (auto-detected)
  --format <fmt>        output format: text, json, html (default: text)
  --threshold <0-100>   fail if score below this (default: 0)
  --prod-only           only check production dependencies
  --output <path>       write report to file
  --concurrency <n>     concurrent registry requests (default: 20)
  -V, --version         output version
  -h, --help            display help`);
}

function parseArgs(argv: string[]): CLIOptions {
  const options: CLIOptions = {
    lockfilePath: '',
    format: 'text',
    threshold: 0,
    prodOnly: false,
    output: '',
    concurrency: 20,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    switch (arg) {
      case '-V':
      case '--version':
        console.log(VERSION);
        process.exit(0);
        break; // unreachable but satisfies TS
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      case '--lockfile':
        options.lockfilePath = argv[++i] ?? '';
        break;
      case '--format': {
        const fmt = argv[++i];
        if (fmt === 'text' || fmt === 'json' || fmt === 'html') {
          options.format = fmt;
        } else {
          console.error(`Invalid format: ${fmt}. Use text, json, or html.`);
          process.exit(2);
        }
        break;
      }
      case '--threshold': {
        const n = parseInt(argv[++i], 10);
        if (isNaN(n) || n < 0 || n > 100) {
          console.error('Threshold must be a number between 0 and 100.');
          process.exit(2);
        }
        options.threshold = n;
        break;
      }
      case '--prod-only':
        options.prodOnly = true;
        break;
      case '--output':
        options.output = argv[++i] ?? '';
        break;
      case '--concurrency': {
        const c = parseInt(argv[++i], 10);
        if (isNaN(c) || c < 1) {
          console.error('Concurrency must be a positive number.');
          process.exit(2);
        }
        options.concurrency = c;
        break;
      }
      default:
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(2);
    }
    i++;
  }

  return options;
}

function getGitHubActionInputs(): Partial<CLIOptions> | null {
  if (process.env.GITHUB_ACTIONS !== 'true') return null;

  const inputs: Partial<CLIOptions> = {};

  const lockfile = process.env.INPUT_LOCKFILE;
  if (lockfile) inputs.lockfilePath = lockfile;

  const format = process.env.INPUT_FORMAT;
  if (format === 'text' || format === 'json' || format === 'html') {
    inputs.format = format;
  }

  const threshold = process.env.INPUT_THRESHOLD;
  if (threshold) {
    const n = parseInt(threshold, 10);
    if (!isNaN(n) && n >= 0 && n <= 100) inputs.threshold = n;
  }

  const prodOnly = process.env['INPUT_PROD-ONLY'];
  if (prodOnly === 'true') inputs.prodOnly = true;

  const concurrency = process.env.INPUT_CONCURRENCY;
  if (concurrency) {
    const n = parseInt(concurrency, 10);
    if (!isNaN(n) && n > 0) inputs.concurrency = n;
  }

  return inputs;
}

export async function checkProvenance(options: Partial<CLIOptions> = {}): Promise<CheckResult> {
  const lockfilePath = options.lockfilePath || detectLockfile(process.cwd());
  const concurrency = options.concurrency ?? 20;
  const prodOnly = options.prodOnly ?? false;

  const deps = parseLockfile(lockfilePath);
  const attestations = await fetchAllAttestations(deps, { concurrency });
  return computeResults(attestations, { prodOnly });
}

async function main(): Promise<void> {
  const cliOptions = parseArgs(process.argv.slice(2));

  // Merge GitHub Action inputs
  const actionInputs = getGitHubActionInputs();
  if (actionInputs) {
    if (actionInputs.lockfilePath && !cliOptions.lockfilePath) {
      cliOptions.lockfilePath = actionInputs.lockfilePath;
    }
    if (actionInputs.format && cliOptions.format === 'text') {
      cliOptions.format = actionInputs.format;
    }
    if (actionInputs.threshold !== undefined && cliOptions.threshold === 0) {
      cliOptions.threshold = actionInputs.threshold;
    }
    if (actionInputs.prodOnly) {
      cliOptions.prodOnly = true;
    }
    if (actionInputs.concurrency !== undefined) {
      cliOptions.concurrency = actionInputs.concurrency;
    }
  }

  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

  try {
    // Detect/resolve lockfile
    const lockfilePath = cliOptions.lockfilePath
      ? resolve(cliOptions.lockfilePath)
      : detectLockfile(process.cwd());

    // Parse lockfile
    const deps = parseLockfile(lockfilePath);

    if (deps.length === 0) {
      console.log('No dependencies found in lockfile.');
      process.exit(0);
    }

    // Fetch attestations
    const attestations = await fetchAllAttestations(deps, { concurrency: cliOptions.concurrency });

    // Compute results
    const result = computeResults(attestations, { prodOnly: cliOptions.prodOnly });

    // Format output
    let output: string;
    if (isGitHubActions && cliOptions.format === 'text') {
      output = formatGitHubActions(result) + '\n' + formatText(result);
    } else {
      switch (cliOptions.format) {
        case 'json':
          output = formatJson(result);
          break;
        case 'html':
          output = formatHtml(result);
          break;
        default:
          output = formatText(result);
      }
    }

    // Write or print
    if (cliOptions.output) {
      writeFileSync(resolve(cliOptions.output), output, 'utf-8');
      console.log(`Report written to ${cliOptions.output}`);
    } else {
      console.log(output);
    }

    // Exit code
    if (result.summary.score < cliOptions.threshold) {
      console.error(`Score ${result.summary.score} is below threshold ${cliOptions.threshold}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

// Run CLI when executed directly
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('/npm-provenance-checker') ||
  process.argv[1].endsWith('/index.js') ||
  process.argv[1].endsWith('/index.cjs')
);

if (isMainModule) {
  main();
}
