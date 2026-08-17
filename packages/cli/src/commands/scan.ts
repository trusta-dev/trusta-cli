import { resolveToken } from '../auth';
import { getProjectByRepoUrl, listProjectScans, getProjectScan, type ScanJobRecord, type SecurityFinding } from '../api';
import { detectProject } from '../detect';
import { printSuccess, printWarning, printStep } from '../output';

const API_URL = process.env['TRUSTA_API_URL'] ?? 'https://api.trusta.dev';

function computeScore(scan: ScanJobRecord): number {
  const critical = scan.criticalCount ?? 0;
  const high = scan.highCount ?? 0;
  return 100 - Math.min(critical * 15 + high * 8, 80);
}

async function resolveProject() {
  const detection = detectProject();
  if (!detection.githubRepoUrl) {
    throw new Error('No GitHub remote found. Run trusta init to link this repo.');
  }
  const token = await resolveToken();
  const transport = { baseUrl: API_URL, token };
  const result = await getProjectByRepoUrl(transport, detection.githubRepoUrl);
  if (!result) {
    throw new Error('This repo is not linked to a Trusta project. Run trusta init.');
  }
  return { transport, project: result.project };
}

export async function scanList(args: string[]) {
  const json = args.includes('--json');
  const { transport, project } = await resolveProject();
  const scans = await listProjectScans(transport, project.id);

  if (json) {
    process.stdout.write(JSON.stringify(scans, null, 2) + '\n');
    return;
  }

  if (scans.length === 0) {
    printWarning('No scans found. Push a commit or trigger a scan from the dashboard.');
    return;
  }

  printStep(`${scans.length} scan${scans.length === 1 ? '' : 's'} for ${project.name}`);
  for (const scan of scans) {
    const score = scan.status === 'completed' ? computeScore(scan) : null;
    const scoreStr = score !== null ? `${score}/100` : '—';
    const target = scan.scanType === 'live_site' ? scan.liveSiteUrl : scan.repoUrl;
    process.stdout.write(
      `  ${scan.id.slice(0, 8)}  ${scan.scanType.padEnd(9)}  ${scan.status.padEnd(9)}  ${scoreStr.padStart(7)}  ${target ?? ''}\n`,
    );
  }
}

export async function scanLatest(args: string[]) {
  const json = args.includes('--json');
  const { transport, project } = await resolveProject();
  const scans = await listProjectScans(transport, project.id);

  const completed = scans.find((s) => s.status === 'completed');
  if (!completed) {
    if (json) {
      process.stdout.write(JSON.stringify({ error: 'no_completed_scan', message: 'No completed scans found.' }) + '\n');
      process.exit(1);
    }
    printWarning('No completed scans found. Push a commit to trigger one.');
    process.exit(1);
  }

  const detail = await getProjectScan(transport, project.id, completed.id);

  if (json) {
    process.stdout.write(JSON.stringify(detail, null, 2) + '\n');
    return;
  }

  const score = computeScore(detail.job);
  printSuccess(`Latest scan — score: ${score}/100`);
  process.stdout.write(`  Scan ID:   ${detail.job.id}\n`);
  process.stdout.write(`  Type:      ${detail.job.scanType}\n`);
  process.stdout.write(`  Status:    ${detail.job.status}\n`);
  process.stdout.write(`  Critical:  ${detail.job.criticalCount ?? 0}\n`);
  process.stdout.write(`  High:      ${detail.job.highCount ?? 0}\n`);
  process.stdout.write(`  Total:     ${detail.job.findingsCount ?? 0}\n`);
  process.stdout.write(`  Completed: ${detail.job.completedAt ?? '—'}\n`);

  if (detail.findings && detail.findings.length > 0) {
    process.stdout.write('\nFindings:\n');
    const sorted = [...detail.findings].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    });
    for (const f of sorted) {
      process.stdout.write(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.filePath}:${f.lineNumber}  ${f.title}\n`);
    }
  }
}

export { type SecurityFinding };
