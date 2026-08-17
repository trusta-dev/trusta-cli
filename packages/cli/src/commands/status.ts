import { resolveToken } from '../auth';
import {
  getProjectByRepoUrl,
  listProjectScans,
  getProjectScan,
  listProjectEvaluations,
  type ScanJobRecord,
} from '../api';
import { detectProject } from '../detect';
import { printWarning } from '../output';

const API_URL = process.env['TRUSTA_API_URL'] ?? 'https://api.trusta.dev';
const APP_URL = process.env['TRUSTA_APP_URL'] ?? 'https://app.trusta.dev';

function computeScore(scan: ScanJobRecord): number {
  const critical = scan.criticalCount ?? 0;
  const high = scan.highCount ?? 0;
  return 100 - Math.min(critical * 15 + high * 8, 80);
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  return '●'.repeat(filled) + '○'.repeat(10 - filled);
}

export async function status(args: string[]) {
  const json = args.includes('--json');

  const detection = detectProject();
  if (!detection.githubRepoUrl) {
    if (json) {
      process.stdout.write(JSON.stringify({ error: 'no_git_remote' }) + '\n');
      process.exit(1);
    }
    printWarning('No GitHub remote found. Run trusta init to link this repo.');
    process.exit(1);
  }

  const token = await resolveToken();
  const transport = { baseUrl: API_URL, token };

  const projectResult = await getProjectByRepoUrl(transport, detection.githubRepoUrl);
  if (!projectResult) {
    if (json) {
      process.stdout.write(JSON.stringify({ error: 'not_linked', message: 'Run trusta init to link this repo.' }) + '\n');
      process.exit(1);
    }
    printWarning('This repo is not linked to a Trusta project. Run trusta init.');
    process.exit(1);
  }

  const { project } = projectResult;

  const [scans, evaluations] = await Promise.all([
    listProjectScans(transport, project.id),
    listProjectEvaluations(transport, project.id).catch(() => []),
  ]);

  const latestCompleted = scans.find((s) => s.status === 'completed') ?? null;
  let detail: { job: ScanJobRecord; findings: unknown[] | null } | null = null;
  if (latestCompleted) {
    detail = await getProjectScan(transport, project.id, latestCompleted.id).catch(() => null);
  }

  const score = latestCompleted ? computeScore(latestCompleted) : null;
  const passCount = evaluations.filter((e) => e.state === 'pass').length;
  const failCount = evaluations.filter((e) => e.state === 'fail').length;
  const staleCount = evaluations.filter((e) => e.state === 'stale' || e.state === 'degraded').length;

  if (json) {
    process.stdout.write(JSON.stringify({
      project: { id: project.id, name: project.name, slug: project.slug },
      score,
      latestScan: latestCompleted ? {
        id: latestCompleted.id,
        scanType: latestCompleted.scanType,
        status: latestCompleted.status,
        criticalCount: latestCompleted.criticalCount,
        highCount: latestCompleted.highCount,
        findingsCount: latestCompleted.findingsCount,
        completedAt: latestCompleted.completedAt,
        findings: detail?.findings ?? null,
      } : null,
      checks: { pass: passCount, fail: failCount, stale: staleCount, total: evaluations.length },
    }, null, 2) + '\n');
    return;
  }

  // Human-readable output
  const trustUrl = `https://trust.trusta.dev/${project.slug}`;
  const dashboardUrl = `${APP_URL}/app`;

  process.stdout.write(`\n  Trusta — ${project.name}\n`);

  if (score !== null) {
    const color = score >= 80 ? '\x1b[32m' : score >= 50 ? '\x1b[33m' : '\x1b[31m';
    const reset = '\x1b[0m';
    process.stdout.write(`  Trust score:  ${color}${score}/100${reset}  [${scoreBar(score)}]\n`);
  } else {
    process.stdout.write('  Trust score:  — (no completed scans)\n');
  }

  process.stdout.write(`  Trust page:   ${trustUrl}\n`);
  process.stdout.write(`  Dashboard:    ${dashboardUrl}\n`);

  if (latestCompleted) {
    const scanDate = latestCompleted.completedAt
      ? new Date(latestCompleted.completedAt).toLocaleDateString()
      : 'unknown date';
    process.stdout.write(`\n  Latest scan (${scanDate}):\n`);
    process.stdout.write(`    Critical   ${latestCompleted.criticalCount ?? 0}   (−15pts each)\n`);
    process.stdout.write(`    High       ${latestCompleted.highCount ?? 0}   (−8pts each)\n`);
    process.stdout.write(`    Total      ${latestCompleted.findingsCount ?? 0}\n`);
  } else {
    process.stdout.write('\n  No completed scans yet.\n');
  }

  if (evaluations.length > 0) {
    process.stdout.write('\n  Trust checks:\n');
    if (passCount > 0) process.stdout.write(`    ✓  ${passCount} passing\n`);
    if (failCount > 0) process.stdout.write(`    ✗  ${failCount} failing\n`);
    if (staleCount > 0) process.stdout.write(`    ~  ${staleCount} stale\n`);
  }

  if (score !== null && score < 100) {
    process.stdout.write('\n  Run /trusta-fix in Claude Code to resolve findings and reach 100/100.\n');
  } else if (score === 100) {
    process.stdout.write('\n  ✓ Perfect score — your trust profile is clean.\n');
  }

  process.stdout.write('\n');
}
