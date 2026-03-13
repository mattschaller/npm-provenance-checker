import type { CheckResult } from './types.js';

export function formatText(result: CheckResult): string {
  const { summary, dependencies } = result;
  const lines: string[] = [];

  lines.push(`Provenance Score: ${summary.score}/100`);
  lines.push('');
  lines.push(`Total: ${summary.total} | Prod: ${summary.prod} | Dev: ${summary.dev}`);
  lines.push(`Attested: ${summary.attested} | Signed-only: ${summary.signedOnly} | Unattested: ${summary.unattested}`);
  lines.push('');

  const sorted = [...dependencies].sort((a, b) => {
    const order = { unattested: 0, 'signed-only': 1, attested: 2 };
    return order[a.status] - order[b.status];
  });

  for (const dep of sorted) {
    const icon = dep.status === 'attested' ? '✓' : dep.status === 'signed-only' ? '~' : '✗';
    const devTag = dep.isDev ? ' (dev)' : '';
    lines.push(`  ${icon} ${dep.name}@${dep.version}${devTag} — ${dep.status}`);
  }

  return lines.join('\n');
}

export function formatJson(result: CheckResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatHtml(result: CheckResult): string {
  const { summary, dependencies } = result;
  const timestamp = new Date().toISOString();

  const scoreColor = summary.score >= 80 ? '#22c55e' : summary.score >= 50 ? '#f59e0b' : '#ef4444';

  const rows = [...dependencies]
    .sort((a, b) => {
      const order = { unattested: 0, 'signed-only': 1, attested: 2 };
      return order[a.status] - order[b.status];
    })
    .map(dep => {
      const bg = dep.status === 'attested' ? '#f0fdf4' : dep.status === 'signed-only' ? '#fffbeb' : '#fef2f2';
      return `<tr style="background:${bg}"><td>${dep.name}</td><td>${dep.version}</td><td>${dep.isDev ? 'dev' : 'prod'}</td><td>${dep.status}</td></tr>`;
    })
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>npm Provenance Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
    h1 { margin-bottom: 0.5rem; }
    .score { font-size: 2rem; font-weight: bold; color: ${scoreColor}; }
    .summary { margin: 1rem 0; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
    .timestamp { color: #999; font-size: 0.85rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>npm Provenance Report</h1>
  <div class="score">${summary.score}/100</div>
  <div class="summary">
    Total: ${summary.total} | Prod: ${summary.prod} | Dev: ${summary.dev}<br>
    Attested: ${summary.attested} | Signed-only: ${summary.signedOnly} | Unattested: ${summary.unattested}
  </div>
  <table>
    <thead><tr><th>Package</th><th>Version</th><th>Type</th><th>Status</th></tr></thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="timestamp">Generated: ${timestamp}</div>
</body>
</html>`;
}

export function formatGitHubActions(result: CheckResult): string {
  const lines: string[] = [];

  for (const dep of result.dependencies) {
    if (dep.isDev) continue;
    if (dep.status === 'unattested') {
      lines.push(`::error::${dep.name}@${dep.version} has no provenance attestation`);
    } else if (dep.status === 'signed-only') {
      lines.push(`::warning::${dep.name}@${dep.version} is signed but lacks provenance attestation`);
    }
  }

  lines.push(`::notice::Provenance score: ${result.summary.score}/100 (${result.summary.prodAttested}/${result.summary.prodTotal} prod deps attested)`);

  return lines.join('\n');
}
