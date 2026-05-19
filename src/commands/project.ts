import { resolveToken } from '../auth';
import { getProjectByRepoUrl } from '../api';
import { detectProject } from '../detect';
import { printSuccess, printWarning } from '../output';

const API_URL = process.env['TRUSTA_API_URL'] ?? 'https://api.trusta.dev';

export async function projectResolve(args: string[]) {
  const json = args.includes('--json');
  const detection = detectProject();

  if (!detection.githubRepoUrl) {
    if (json) {
      process.stdout.write(JSON.stringify({ error: 'no_git_remote', message: 'No GitHub remote found in this directory.' }) + '\n');
      process.exit(1);
    }
    printWarning('No GitHub remote found. Run trusta init to link this repo.');
    process.exit(1);
  }

  const token = await resolveToken();
  const result = await getProjectByRepoUrl({ baseUrl: API_URL, token }, detection.githubRepoUrl);

  if (!result) {
    if (json) {
      process.stdout.write(JSON.stringify({ error: 'not_linked', message: 'This repo is not linked to a Trusta project. Run trusta init.' }) + '\n');
      process.exit(1);
    }
    printWarning('This repo is not linked to a Trusta project. Run trusta init.');
    process.exit(1);
  }

  if (json) {
    process.stdout.write(JSON.stringify(result.project, null, 2) + '\n');
    return;
  }

  printSuccess(`Project: ${result.project.name}`);
  process.stdout.write(`  ID:   ${result.project.id}\n`);
  process.stdout.write(`  Slug: ${result.project.slug}\n`);
}
