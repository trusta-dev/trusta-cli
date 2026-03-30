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
): Promise<T> {
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
  const response = await fetch(`${transport.baseUrl}${path}`, init);

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
): Promise<{ user: { id: string; name: string } }> {
  return apiRequest<{ user: { id: string; name: string } }>(transport, 'GET', '/me');
}
