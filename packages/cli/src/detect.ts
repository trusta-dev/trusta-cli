import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

export interface ProjectDetection {
  readonly projectName: string | null;
  readonly githubRepoUrl: string | null;
  readonly framework: string | null;
}

export function detectProject(cwd: string = process.cwd()): ProjectDetection {
  const projectName = detectProjectName(cwd);
  const githubRepoUrl = detectGitHubRepoUrl(cwd);
  const framework = detectFramework(cwd);
  return { projectName, githubRepoUrl, framework };
}

function detectProjectName(cwd: string): string | null {
  const pkgPath = `${cwd}/package.json`;
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (typeof pkg.name === 'string' && pkg.name.length > 0) {
        return pkg.name.replace(/^@[^/]+\//, '');
      }
    } catch {
      // ignore
    }
  }
  return cwd.split('/').at(-1) ?? null;
}

function detectGitHubRepoUrl(cwd: string): string | null {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .toString()
      .trim();

    // SSH: git@github.com:owner/repo.git
    const sshMatch = /^git@github\.com:([^/]+\/[^.]+)/.exec(remote);
    if (sshMatch?.[1]) {
      return `https://github.com/${sshMatch[1]}`;
    }

    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = /^https:\/\/github\.com\/([^/]+\/[^.]+)/.exec(remote);
    if (httpsMatch?.[1]) {
      return `https://github.com/${httpsMatch[1]}`;
    }
  } catch {
    // not a git repo or no remote
  }
  return null;
}

function detectFramework(cwd: string): string | null {
  const pkgPath = `${cwd}/package.json`;
  if (!existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if ('next' in deps) return 'Next.js';
    if ('nuxt' in deps) return 'Nuxt';
    if ('remix' in deps || '@remix-run/node' in deps) return 'Remix';
    if ('astro' in deps) return 'Astro';
    if ('svelte' in deps) return 'SvelteKit';
    if ('react' in deps) return 'React';
    if ('vue' in deps) return 'Vue';
    if ('express' in deps) return 'Express';
    if ('fastify' in deps) return 'Fastify';
  } catch {
    // ignore
  }

  if (existsSync(`${cwd}/requirements.txt`) || existsSync(`${cwd}/pyproject.toml`)) {
    return 'Python';
  }
  if (existsSync(`${cwd}/go.mod`)) return 'Go';
  if (existsSync(`${cwd}/Cargo.toml`)) return 'Rust';

  return null;
}
