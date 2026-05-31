import { resolveToken } from '../auth';
import { getMe, getProjectByRepoUrl, listOrganizationProjects, registerProjectRepo } from '../api';
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

export async function projectList(args: string[]) {
  const json = args.includes('--json');
  const token = await resolveToken();
  const transport = { baseUrl: API_URL, token };

  const me = await getMe(transport);
  if (me.organizations.length === 0) {
    if (json) {
      process.stdout.write(JSON.stringify({ projects: [] }) + '\n');
    } else {
      printWarning('No workspace found. Run trusta init to get started.');
    }
    return;
  }

  const allProjects: Array<{ id: string; name: string; slug: string }> = [];
  for (const org of me.organizations) {
    const projects = await listOrganizationProjects(transport, org.id);
    allProjects.push(...projects);
  }

  if (json) {
    process.stdout.write(JSON.stringify({ projects: allProjects }, null, 2) + '\n');
    return;
  }

  if (allProjects.length === 0) {
    printWarning('No projects found. Run trusta init to create one.');
    return;
  }

  process.stdout.write('Projects:\n');
  for (const p of allProjects) {
    process.stdout.write(`  ${p.name}  (id: ${p.id}  slug: ${p.slug})\n`);
  }
}

export async function projectLink(args: string[]) {
  const json = args.includes('--json');
  const explicitIdOrSlug = args.find((a) => !a.startsWith('--'));

  const detection = detectProject();
  if (!detection.githubRepoUrl) {
    if (json) {
      process.stdout.write(JSON.stringify({ error: 'no_git_remote', message: 'No GitHub remote found in this directory.' }) + '\n');
    } else {
      printWarning('No GitHub remote found in this directory.');
    }
    process.exit(1);
    return;
  }

  const token = await resolveToken();
  const transport = { baseUrl: API_URL, token };

  // Collect all projects across orgs
  const me = await getMe(transport);
  const allProjects: Array<{ id: string; name: string; slug: string }> = [];
  for (const org of me.organizations) {
    const projects = await listOrganizationProjects(transport, org.id);
    allProjects.push(...projects);
  }

  let projectId: string;

  if (explicitIdOrSlug) {
    // Explicit arg: match by id, slug, or name
    const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(explicitIdOrSlug);
    const found = looksLikeUuid
      ? allProjects.find((p) => p.id === explicitIdOrSlug)
      : allProjects.find((p) => p.slug === explicitIdOrSlug || p.name === explicitIdOrSlug);
    if (!found) {
      const msg = `No project found matching "${explicitIdOrSlug}". Run trusta project list to see your projects.`;
      if (json) process.stdout.write(JSON.stringify({ error: 'not_found', message: msg }) + '\n');
      else printWarning(msg);
      process.exit(1);
      return;
    }
    projectId = found.id;
  } else {
    // Auto-match: derive repo name from git remote and find a project with the same name/slug
    const repoName = detection.githubRepoUrl.split('/').at(-1)?.toLowerCase() ?? '';
    const found = allProjects.find(
      (p) => p.slug.toLowerCase() === repoName || p.name.toLowerCase() === repoName,
    );
    if (!found) {
      const names = allProjects.map((p) => `${p.name} (${p.slug})`).join(', ');
      const msg = `Could not auto-match a project for repo "${repoName}". Available: ${names || 'none'}. Run trusta project list or pass the slug: trusta project link <slug>`;
      if (json) process.stdout.write(JSON.stringify({ error: 'not_found', message: msg }) + '\n');
      else printWarning(msg);
      process.exit(1);
      return;
    }
    projectId = found.id;
    if (!json) process.stdout.write(`  Matched project: ${found.name}\n`);
  }

  await registerProjectRepo(transport, projectId, detection.githubRepoUrl);

  if (json) {
    process.stdout.write(JSON.stringify({ projectId, repoUrl: detection.githubRepoUrl }) + '\n');
  } else {
    printSuccess(`Linked ${detection.githubRepoUrl} to project ${projectId}`);
  }
}
