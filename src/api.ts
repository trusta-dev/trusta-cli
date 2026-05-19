export interface CliApiTransport {
  readonly baseUrl: string;
  readonly token: string;
}

interface ApiError {
  error?: { message?: string };
}

async function apiRequest<T>(
  transport: CliApiTransport,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${transport.baseUrl}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${transport.token}`,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(url.toString(), init);
  } catch (err) {
    const cause = err instanceof Error ? err.cause : null;
    const detail =
      cause instanceof Error ? ` (${cause.message})` : '';
    throw new Error(`Could not reach ${url.hostname}${detail}`);
  }

  const data = (await response.json()) as T | ApiError;

  if (!response.ok) {
    const errorData = data as ApiError;
    const message = errorData.error?.message ?? `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export interface BootstrapResult {
  organization: { id: string; name: string };
  project: { id: string; name: string; slug: string };
}

export interface CollectorResult {
  collector: { id: string; name: string };
  secret: { value: string };
}

export async function bootstrapWorkspace(
  transport: CliApiTransport,
  input: { workspaceName: string; projectName: string },
): Promise<BootstrapResult> {
  const result = await apiRequest<{ organization: { id: string; name: string }; project: { id: string; name: string; slug: string } }>(
    transport,
    'POST',
    '/onboarding/bootstrap',
    input,
  );
  return result;
}

export async function createCollector(
  transport: CliApiTransport,
  projectId: string,
  name: string,
): Promise<CollectorResult> {
  return apiRequest<CollectorResult>(transport, 'POST', `/projects/${projectId}/collectors`, {
    name,
    allowedActions: ['evidence:write', 'heartbeat:write'],
  });
}

export interface IngestEvidenceInput {
  readonly projectId: string;
  readonly evidenceType: string;
  readonly sourceType: string;
  readonly sourceRef: string;
  readonly observedAt: string;
  readonly payload: unknown;
  readonly metadataJson?: unknown;
}

export async function ingestEvidence(
  collectorTransport: CliApiTransport,
  input: IngestEvidenceInput,
): Promise<{ evidenceRecordId: string }> {
  return apiRequest<{ evidenceRecordId: string }>(
    collectorTransport,
    'POST',
    '/ingest/evidence',
    input,
  );
}

export async function registerProjectRepo(
  transport: CliApiTransport,
  projectId: string,
  repoUrl: string,
): Promise<{ id: string; projectId: string; repoUrl: string; createdAt: string }> {
  return apiRequest(transport, 'POST', `/projects/${projectId}/repos`, { repoUrl });
}

export async function updateProject(
  transport: CliApiTransport,
  projectId: string,
  input: {
    privacyPolicyUrl?: string | null;
    securityContactEmail?: string | null;
  },
): Promise<void> {
  await apiRequest(transport, 'PATCH', `/projects/${projectId}`, input);
}

export async function getMe(
  transport: CliApiTransport,
): Promise<{ user: { id: string; name: string }; organizations: Array<{ id: string; name: string; slug: string }> }> {
  return apiRequest<{ user: { id: string; name: string }; organizations: Array<{ id: string; name: string; slug: string }> }>(transport, 'GET', '/me');
}

export async function createProject(
  transport: CliApiTransport,
  input: { organizationId: string; name: string },
): Promise<{ project: { id: string; name: string; slug: string } }> {
  return apiRequest<{ project: { id: string; name: string; slug: string } }>(
    transport,
    'POST',
    '/projects',
    input,
  );
}

export interface ScanJobRecord {
  readonly id: string;
  readonly scanType: 'code' | 'live_site';
  readonly repoUrl: string | null;
  readonly commitSha: string | null;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly findingsCount: number | null;
  readonly criticalCount: number | null;
  readonly highCount: number | null;
  readonly liveSiteUrl: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface SecurityFinding {
  readonly findingId: string;
  readonly ruleId: string;
  readonly title: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  readonly filePath: string;
  readonly lineNumber: number;
  readonly snippet: string;
  readonly fix: string;
}

export interface EvaluationRecord {
  readonly state: 'pass' | 'fail' | 'stale' | 'degraded';
  readonly control: { readonly id: string; readonly publicName: string };
}

export async function listProjectScans(
  transport: CliApiTransport,
  projectId: string,
): Promise<ScanJobRecord[]> {
  const result = await apiRequest<{ scans: ScanJobRecord[] }>(
    transport, 'GET', `/projects/${projectId}/scans`,
  );
  return result.scans;
}

export async function getProjectScan(
  transport: CliApiTransport,
  projectId: string,
  scanId: string,
): Promise<{ job: ScanJobRecord; findings: SecurityFinding[] | null }> {
  return apiRequest<{ job: ScanJobRecord; findings: SecurityFinding[] | null }>(
    transport, 'GET', `/projects/${projectId}/scans/${scanId}`,
  );
}

export async function listProjectEvaluations(
  transport: CliApiTransport,
  projectId: string,
): Promise<EvaluationRecord[]> {
  const result = await apiRequest<{ evaluations: EvaluationRecord[] }>(
    transport, 'GET', `/projects/${projectId}/evaluations`,
  );
  return result.evaluations;
}

export async function getProjectByRepoUrl(
  transport: CliApiTransport,
  repoUrl: string,
): Promise<{ project: { id: string; name: string; slug: string; organizationId: string } } | null> {
  try {
    return await apiRequest<{ project: { id: string; name: string; slug: string; organizationId: string } }>(
      transport,
      'GET',
      '/projects/by-repo',
      undefined,
      { repoUrl },
    );
  } catch {
    return null;
  }
}
