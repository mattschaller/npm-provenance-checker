# npm-provenance-checker

Batch-verify npm provenance attestations across your project's lockfile. No `node_modules` required.

**The problem:** `npm audit signatures` requires an installed `node_modules` tree and produces no exportable report. There's no open-source tool that batch-checks provenance attestations from a lockfile alone.

**npm-provenance-checker** parses your lockfile (npm, yarn, pnpm), checks each dependency against the npm registry for [SLSA provenance](https://slsa.dev/) attestations, and outputs a tiered compliance report with a score.

## Quick Start

```bash
# Run in any project with a lockfile
npx npm-provenance-checker

# Check only production deps with a minimum score
npx npm-provenance-checker --prod-only --threshold 80

# Output JSON report
npx npm-provenance-checker --format json --output report.json

# Output HTML report
npx npm-provenance-checker --format html --output report.html
```

## CLI Usage

```
npm-provenance-checker [options]

Options:
  --lockfile <path>     path to lockfile (auto-detected)
  --format <fmt>        output format: text, json, html (default: text)
  --threshold <0-100>   fail if score below this (default: 0)
  --prod-only           only check production dependencies
  --output <path>       write report to file
  --concurrency <n>     concurrent registry requests (default: 20)
  -V, --version         output version
  -h, --help            display help
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0    | Pass — score meets or exceeds threshold |
| 1    | Fail — score below threshold |
| 2    | Runtime error |

## GitHub Action

```yaml
name: Provenance Check
on: [push, pull_request]

jobs:
  provenance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mattschaller/npm-provenance-checker@v0
        with:
          threshold: '70'
          prod-only: 'true'
```

### Action Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `lockfile` | Path to lockfile | auto-detected |
| `format` | Output format: text, json, html | `text` |
| `threshold` | Minimum score (0-100) | `0` |
| `prod-only` | Only check prod deps | `false` |
| `concurrency` | Max concurrent requests | `20` |

## Programmatic API

```typescript
import { checkProvenance, parseLockfile, fetchAllAttestations, computeResults } from 'npm-provenance-checker';

// High-level: check a project
const result = await checkProvenance({ prodOnly: true, threshold: 80 });
console.log(result.summary.score);

// Low-level: parse + check + compute
const deps = parseLockfile('package-lock.json');
const attestations = await fetchAllAttestations(deps);
const result = computeResults(attestations, { prodOnly: true });
```

## Lockfile Support

| Lockfile | Format | Dev detection |
|----------|--------|---------------|
| `package-lock.json` | v3 (npm 7+) | `dev`/`devOptional` fields |
| `yarn.lock` | v1 | Cross-reference with `package.json` |
| `pnpm-lock.yaml` | v5, v6+ | `dev` field |

## Scoring

The provenance score is computed from **production dependencies only**:

```
score = round((prod_attested / prod_total) * 100)
```

Each dependency is classified into one of three tiers:

- **Attested** — has SLSA provenance attestation (`dist.attestations.provenance`)
- **Signed-only** — has registry signatures but no provenance (`dist.signatures`)
- **Unattested** — neither signatures nor provenance

Dev dependencies are reported but do not affect the score.

## Related

- [slopcheck](https://github.com/mattschaller/slopcheck) — Catch hallucinated npm packages before they catch you
- [eslint-plugin-mcp-security](https://github.com/mattschaller/eslint-plugin-mcp-security) — ESLint rules for MCP server security

## License

MIT
