import { resolveToken } from '../auth';
import { getProjectByRepoUrl, registerProjectRepo } from '../api';
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

export async function projectLink(args: string[]) {
  const json = args.includes('--json');
  const projectId = args.find((a) => !a.startsWith('--'));

  if (!projectId) {
    process.stderr.write('Usage: trusta project link <project-id>\n');
    process.exit(1);
  }

  const detection = detectProject();
  if (!detection.githubRepoUrl) {
    if (json) {
      process.stdout.write(JSON.stringify({ error: 'no_git_remote', message: 'No GitHub remote found in this directory.' }) + '\n');
    } else {
      printWarning('No GitHub remote found in this directory.');
    }
    process.exit(1);
  }

  const token = await resolveToken();
  const transport = { baseUrl: API_URL, token };

  await registerProjectRepo(transport, projectId, detection.githubRepoUrl);

  if (json) {
    process.stdout.write(JSON.stringify({ projectId, repoUrl: detection.githubRepoUrl }) + '\n');
  } else {
    printSuccess(`Linked ${detection.githubRepoUrl} to project ${projectId}`);
  }
}
