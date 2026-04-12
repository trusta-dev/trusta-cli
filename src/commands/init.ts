import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { detectProject } from '../detect';
import {
  bootstrapWorkspace,
  createCollector,
  ingestEvidence,
  registerProjectRepo,
  updateProject,
  type CliApiTransport,
} from '../api';
import { resolveToken } from '../auth';
import { scanLocalDirectory } from '../scanner';
import {
  printBanner,
  printStep,
  printSuccess,
  printWarning,
  printInfo,
  printCode,
  printDivider,
} from '../output';
import { createPrompter } from '../prompt';

const DEFAULT_API_URL = 'https://api.trusta.dev';
const DEFAULT_APP_URL = 'https://app.trusta.dev';

export async function init() {
  printBanner();

  const detection = detectProject();
  const prompter = createPrompter();

  try {
    // Resolve API base URL
    const apiUrl = (process.env['TRUSTA_API_URL'] ?? DEFAULT_API_URL).replace(/\/$/, '');
    const appUrl = (process.env['TRUSTA_APP_URL'] ?? DEFAULT_APP_URL).replace(/\/$/, '');

    // Resolve API token — browser login flow, silent refresh, or TRUSTA_API_TOKEN env override
    printStep('Authenticating...');
    const token = await resolveToken();
    printSuccess('Authenticated.');

    const transport: CliApiTransport = { baseUrl: apiUrl, token };

    // Workspace name
    const defaultWorkspaceName = detection.projectName
      ? toTitleCase(detection.projectName)
      : undefined;
    printStep('Name your workspace (your company or app name).');
    const workspaceName = await prompter.ask('Workspace name', defaultWorkspaceName);
    if (!workspaceName) {
      throw new Error('Workspace name is required.');
    }

    // Project name
    const defaultProjectName = detection.projectName ?? undefined;
    const projectName = await prompter.ask('First project name', defaultProjectName);
    if (!projectName) {
      throw new Error('Project name is required.');
    }

    printDivider();

    // Bootstrap workspace + project
    printStep('Creating workspace and project...');
    const { organization, project } = await bootstrapWorkspace(transport, {
      workspaceName,
      projectName,
    });
    printSuccess(`Workspace "${organization.name}" created`);
    printSuccess(`Project "${project.name}" created`);

    // Create GitHub Actions collector
    printStep('Creating collector credential for GitHub Actions...');
    const collector = await createCollector(transport, project.id, 'github-actions');
    printSuccess('Collector "github-actions" created');

    // Register the GitHub repo URL so push webhooks resolve to this project
    if (detection.githubRepoUrl) {
      try {
        await registerProjectRepo(transport, project.id, detection.githubRepoUrl);
        printSuccess(`GitHub repo linked: ${detection.githubRepoUrl}`);
      } catch {
        printWarning('Could not link GitHub repo — you can add it later in the dashboard.');
      }
    }

    printDivider();

    // Run local security scan and push findings as evidence
    printStep('Scanning local files for security issues...');
    const cwd = process.cwd();
    try {
      const scanResult = await scanLocalDirectory(cwd);
      const { summary, findings } = scanResult;

      // Use collector secret as bearer token for evidence ingest
      const collectorTransport: CliApiTransport = {
        baseUrl: apiUrl,
        token: collector.secret.value,
      };

      await ingestEvidence(collectorTransport, {
        projectId: project.id,
        evidenceType: 'security_scan',
        sourceType: 'local_fs',
        sourceRef: cwd,
        observedAt: new Date().toISOString(),
        payload: { findings: findings.slice(0, 100) }, // cap payload size
        metadataJson: summary,
      });

      // Print scan summary
      if (summary.criticalCount > 0 || summary.highCount > 0) {
        printWarning(
          `Security scan found ${summary.criticalCount} critical, ${summary.highCount} high, ` +
          `${summary.mediumCount} medium issues across ${summary.filesScanned} files.`,
        );
        const topFindings = findings
          .filter((f) => f.severity === 'critical' || f.severity === 'high')
          .slice(0, 5);
        for (const finding of topFindings) {
          process.stdout.write(
            `  [${finding.severity.toUpperCase()}] ${finding.filePath}:${finding.lineNumber} — ${finding.ruleId}\n`,
          );
        }
        if (findings.length > 5) {
          process.stdout.write(`  ... and ${findings.length - 5} more. See dashboard for details.\n`);
        }
      } else {
        printSuccess(
          `Security scan passed — ${summary.filesScanned} files scanned, score: ${summary.securityScore}/100`,
        );
      }
    } catch {
      printWarning('Security scan could not complete — you can trigger one from the dashboard.');
    }

    // Collect trust attestations
    printDivider();
    printStep(
      'Declare trust attestations (improves your trust score — press enter to skip any).',
    );

    const privacyPolicyUrl = await prompter.ask('Privacy policy URL');
    const securityContactEmail = await prompter.ask('Security contact email');

    interface SubProcessorEntry {
      name: string;
      purpose: string;
      location: string;
    }
    const subProcessors: SubProcessorEntry[] = [];
    const addSp = await prompter.ask(
      'Declare sub-processors (third-party services that process user data)? [y/N]',
    );
    if (addSp.toLowerCase() === 'y') {
      let addingMore = true;
      while (addingMore) {
        const name = await prompter.ask('  Sub-processor name (e.g. Stripe)');
        if (!name) break;
        const purpose = await prompter.ask('  Purpose (e.g. Payment processing)');
        const location = await prompter.ask('  Location (e.g. United States)');
        if (name && purpose && location) {
          subProcessors.push({ name, purpose, location });
          printSuccess(`Added: ${name}`);
        }
        const another = await prompter.ask('  Add another? [y/N]');
        addingMore = another.toLowerCase() === 'y';
      }
    }

    // Persist attestations
    const attestationUpdate: {
      privacyPolicyUrl?: string | null;
      securityContactEmail?: string | null;
    } = {};
    if (privacyPolicyUrl) attestationUpdate.privacyPolicyUrl = privacyPolicyUrl;
    if (securityContactEmail) attestationUpdate.securityContactEmail = securityContactEmail;

    if (Object.keys(attestationUpdate).length > 0) {
      try {
        await updateProject(transport, project.id, attestationUpdate);
        printSuccess('Trust attestations saved.');
      } catch {
        printWarning('Could not save attestations — update them in the dashboard.');
      }
    }

    if (subProcessors.length > 0) {
      const trustaDir = join(cwd, '.trusta');
      mkdirSync(trustaDir, { recursive: true });
      const spPath = join(trustaDir, 'sub-processors.json');
      writeFileSync(spPath, JSON.stringify(subProcessors, null, 2) + '\n');
      printSuccess(
        `Written .trusta/sub-processors.json (${subProcessors.length} sub-processor${subProcessors.length === 1 ? '' : 's'}) — commit this file to your repo.`,
      );
    }

    // Output summary
    const trustUrl = `${DEFAULT_APP_URL}/trust/${project.slug}`;

    printSuccess('Setup complete!');
    printDivider();

    printInfo('Trust page:', trustUrl);
    printInfo('Dashboard:', `${appUrl}/app`);
    printDivider();

    // GitHub Actions YAML snippet
    process.stdout.write('  Add this to your GitHub Actions workflow:\n');
    printCode(buildGitHubActionsYaml(collector.secret.value, apiUrl, project.id, detection.githubRepoUrl ?? undefined));

    // Agent setup prompt
    if (detection.framework) {
      process.stdout.write(`  Detected framework: ${detection.framework}\n\n`);
    }

    process.stdout.write('  To configure Trusta with an AI agent (Claude Code, Cursor, Windsurf):\n');
    printCode(buildAgentPrompt(collector.secret.value, apiUrl, project.id));

    process.stdout.write(
      '  Save TRUSTA_COLLECTOR_SECRET as a GitHub Actions secret to keep it out of your repo.\n\n',
    );
  } finally {
    prompter.close();
  }
}

function toTitleCase(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildGitHubActionsYaml(
  secret: string,
  apiUrl: string,
  projectId: string,
  repoUrl?: string,
): string {
  const repoLine = repoUrl ? `        repo_url: '${repoUrl}'\n` : '';
  return `- name: Report to Trusta
  uses: trusta/trusta-action@v1
  with:
    api_url: '${apiUrl}'
    project_id: '${projectId}'
${repoLine}  env:
    TRUSTA_COLLECTOR_SECRET: \${{ secrets.TRUSTA_COLLECTOR_SECRET }}
    # Secret value (save as GitHub Actions secret):
    # ${secret}`;
}

function buildAgentPrompt(secret: string, apiUrl: string, projectId: string): string {
  return `Set up Trusta evidence collection for this project.
API URL: ${apiUrl}
Project ID: ${projectId}
Collector secret: ${secret}
Add TRUSTA_COLLECTOR_SECRET=${secret} to CI environment variables.
Then call POST ${apiUrl}/ingest/evidence with Bearer auth on each deploy.`;
}
