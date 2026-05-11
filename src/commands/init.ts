import { detectProject } from '../detect';
import {
  bootstrapWorkspace,
  createProject,
  createCollector,
  getMe,
  getProjectByRepoUrl,
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

const API_URL = 'https://api.trusta.dev';
const APP_URL = 'https://app.trusta.dev';

export async function init() {
  printBanner();

  const detection = detectProject();
  const prompter = createPrompter();

  try {
    const apiUrl = API_URL;
    const appUrl = APP_URL;

    // Resolve API token — browser login flow, silent refresh, or TRUSTA_API_TOKEN env override
    printStep('Authenticating...');
    const token = await resolveToken();
    printSuccess('Authenticated.');

    const transport: CliApiTransport = { baseUrl: apiUrl, token };

    // Check if this repo is already linked to a project
    let organization: { id: string; name: string } | undefined;
    let project: { id: string; name: string; slug: string } | undefined;
    let isExistingProject = false;

    if (detection.githubRepoUrl) {
      const existing = await getProjectByRepoUrl(transport, detection.githubRepoUrl);
      if (existing) {
        organization = { id: existing.project.organizationId, name: '' };
        project = existing.project;
        isExistingProject = true;
        printSuccess(`Found existing project "${project.name}" linked to this repo.`);
      }
    }

    if (!isExistingProject) {
      const me = await getMe(transport);
      const existingOrg = me.organizations[0];
      const defaultProjectName = detection.projectName ?? undefined;

      printDivider();

      if (existingOrg) {
        // Existing user — add a project to their workspace
        printStep(`Adding project to workspace "${existingOrg.name}"...`);
        const projectName = await prompter.ask('Project name', defaultProjectName);
        if (!projectName) {
          throw new Error('Project name is required.');
        }
        organization = existingOrg;
        const result = await createProject(transport, {
          organizationId: existingOrg.id,
          name: projectName,
        });
        project = result.project;
        printSuccess(`Project "${project.name}" created`);
      } else {
        // New user — full workspace bootstrap
        const defaultWorkspaceName = detection.projectName
          ? toTitleCase(detection.projectName)
          : undefined;
        printStep('Name your workspace (your company or app name).');
        const workspaceName = await prompter.ask('Workspace name', defaultWorkspaceName);
        if (!workspaceName) {
          throw new Error('Workspace name is required.');
        }
        const projectName = await prompter.ask('First project name', defaultProjectName);
        if (!projectName) {
          throw new Error('Project name is required.');
        }
        printStep('Creating workspace and project...');
        const bootstrapped = await bootstrapWorkspace(transport, {
          workspaceName,
          projectName,
        });
        organization = bootstrapped.organization;
        project = bootstrapped.project;
        printSuccess(`Workspace "${organization.name}" created`);
        printSuccess(`Project "${project.name}" created`);
      }
    }

    if (!project) {
      throw new Error('No project resolved.');
    }

    printDivider();

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

    // Output summary
    const trustUrl = `${appUrl}/${project.slug}`;

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
  _projectId: string,
  _repoUrl?: string,
): string {
  const apiLine = apiUrl !== 'https://api.trusta.dev' ? `          api_url: '${apiUrl}'\n` : '';
  return `- name: Run Trusta
  uses: trusta-dev/trusta-action@v1
  with:
${apiLine}    collector_secret: \${{ secrets.TRUSTA_COLLECTOR_SECRET }}
    # Save this as a GitHub Actions secret named TRUSTA_COLLECTOR_SECRET:
    # ${secret}`;
}

function buildAgentPrompt(secret: string, apiUrl: string, _projectId: string): string {
  return `Set up Trusta trust signal reporting for this project.

API URL: ${apiUrl}
Collector secret: ${secret}

Add TRUSTA_COLLECTOR_SECRET=${secret} as a GitHub Actions secret, then add this step to your workflow:

- name: Run Trusta
  uses: trusta-dev/trusta-action@v1
  with:
    collector_secret: \${{ secrets.TRUSTA_COLLECTOR_SECRET }}`;
}
