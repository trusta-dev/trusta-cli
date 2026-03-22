import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

// --- Types (inlined — CLI has no runtime deps) ---

export type SecurityFindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface SecurityFinding {
  readonly findingId: string;
  readonly ruleId: string;
  readonly severity: SecurityFindingSeverity;
  readonly filePath: string;
  readonly lineNumber: number;
  readonly snippet: string;
  readonly fix: string;
}

export interface LocalScanSummary {
  readonly criticalCount: number;
  readonly highCount: number;
  readonly mediumCount: number;
  readonly lowCount: number;
  readonly rlsBypassCount: number;
  readonly apiAuthCount: number;
  readonly securityScore: number;
  readonly filesScanned: number;
}

export interface LocalScanResult {
  readonly findings: SecurityFinding[];
  readonly summary: LocalScanSummary;
}

// --- Scanning rules (mirrors packages/domain — pure, no I/O) ---

const SECRET_PATTERNS: ReadonlyArray<{
  ruleId: string;
  pattern: RegExp;
  severity: SecurityFindingSeverity;
  fix: string;
}> = [
  {
    ruleId: 'hardcoded_stripe_secret_key',
    pattern: /\bsk_(live|test)_[a-zA-Z0-9]{24,}\b/g,
    severity: 'critical',
    fix: 'Move this Stripe secret key to an environment variable (e.g. process.env.STRIPE_SECRET_KEY) and add it to your .env file. Never commit secret keys to source control.',
  },
  {
    ruleId: 'hardcoded_supabase_service_role_key',
    pattern: /\beyJ[a-zA-Z0-9+/]{50,}={0,2}\b/g,
    severity: 'critical',
    fix: 'Move this Supabase service role key to a server-only environment variable. Never use the service role key in client-side code — it bypasses all Row Level Security policies.',
  },
  {
    ruleId: 'hardcoded_openai_api_key',
    pattern: /\bsk-(?:proj-)?[a-zA-Z0-9]{32,}\b/g,
    severity: 'critical',
    fix: 'Move this OpenAI API key to an environment variable (e.g. process.env.OPENAI_API_KEY). Exposed API keys can result in unauthorized charges.',
  },
  {
    ruleId: 'hardcoded_anthropic_api_key',
    pattern: /\bsk-ant-[a-zA-Z0-9_-]{32,}\b/g,
    severity: 'critical',
    fix: 'Move this Anthropic API key to an environment variable (e.g. process.env.ANTHROPIC_API_KEY). Exposed API keys can result in unauthorized charges.',
  },
  {
    ruleId: 'hardcoded_aws_secret_access_key',
    pattern: /(?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key)\s*[=:]\s*["']?([a-zA-Z0-9/+]{40})["']?/g,
    severity: 'critical',
    fix: 'Remove this AWS secret access key from source code. Use IAM roles, environment variables, or AWS Secrets Manager instead.',
  },
];

const CLIENT_SIDE_PATH_PATTERNS = [
  /^(src\/)?components\//,
  /^(src\/)?pages\//,
  /^(src\/)?app\//,
  /^(src\/)?hooks\//,
  /^(src\/)?lib\//,
  /\.(tsx|jsx)$/,
];

const SERVER_SIDE_PATH_EXCLUSIONS = [
  /route\.(ts|js)$/,
  /server\.(ts|js)$/,
  /api\//,
  /actions\.(ts|js)$/,
  /middleware\.(ts|js)$/,
];

function isClientSidePath(filePath: string): boolean {
  const isClientLike = CLIENT_SIDE_PATH_PATTERNS.some((p) => p.test(filePath));
  const isServerExcluded = SERVER_SIDE_PATH_EXCLUSIONS.some((p) => p.test(filePath));
  return isClientLike && !isServerExcluded;
}

function scanForHardcodedSecrets(fileContent: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');

  for (const rule of SECRET_PATTERNS) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(fileContent)) !== null) {
      const before = fileContent.slice(0, match.index);
      const lineNumber = before.split('\n').length;
      const line = lines[lineNumber - 1] ?? '';
      const snippet = line.trim().slice(0, 120);
      findings.push({
        findingId: `${rule.ruleId}:${filePath}:${lineNumber}`,
        ruleId: rule.ruleId,
        severity: rule.severity,
        filePath,
        lineNumber,
        snippet,
        fix: rule.fix,
      });
    }
    rule.pattern.lastIndex = 0;
  }

  return findings;
}

function scanForRlsBypassVulnerabilities(fileContent: string, filePath: string): SecurityFinding[] {
  if (!isClientSidePath(filePath)) return [];

  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const serviceRolePattern = /createClient\s*\([^)]*(?:SERVICE_ROLE|service_role|serviceRole)[^)]*\)/g;
  let match: RegExpExecArray | null;
  while ((match = serviceRolePattern.exec(fileContent)) !== null) {
    const before = fileContent.slice(0, match.index);
    const lineNumber = before.split('\n').length;
    const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
    findings.push({
      findingId: `rls_bypass_client_service_role:${filePath}:${lineNumber}`,
      ruleId: 'rls_bypass_client_service_role',
      severity: 'critical',
      filePath,
      lineNumber,
      snippet,
      fix: 'Never use the Supabase service role key in client-side code. It bypasses all Row Level Security policies and exposes all your data. Use the anon key for client code and keep the service role key server-side only.',
    });
  }

  return findings;
}

function scanForExposedAdminRoutes(fileContent: string, filePath: string): SecurityFinding[] {
  if (!isClientSidePath(filePath)) return [];

  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const localStorageAuthPattern =
    /localStorage\.getItem\s*\(\s*["'](?:role|isAdmin|admin|is_admin|userRole|user_role)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = localStorageAuthPattern.exec(fileContent)) !== null) {
    const before = fileContent.slice(0, match.index);
    const lineNumber = before.split('\n').length;
    const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
    findings.push({
      findingId: `exposed_admin_route_localstorage:${filePath}:${lineNumber}`,
      ruleId: 'exposed_admin_route_localstorage',
      severity: 'high',
      filePath,
      lineNumber,
      snippet,
      fix: 'Do not use localStorage for admin access control. localStorage can be modified by any user in their browser. Implement server-side role checks using your auth provider (Supabase RLS, session middleware, etc.).',
    });
  }

  return findings;
}

function scanForUnprotectedApiEndpoints(fileContent: string, filePath: string): SecurityFinding[] {
  if (!/(route\.(ts|js)|api\/|handler\.(ts|js))/.test(filePath)) return [];

  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');

  const firstLines = lines.slice(0, 30).join('\n');
  const hasAuthCheck =
    /\b(?:getServerSession|auth\(\)|verifyJwt|authenticate|requireAuth|withAuth|getSession|supabase\.auth|createServerClient)\b/.test(
      firstLines,
    );

  const exportedHandlerPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|handler)\b/g;
  let match: RegExpExecArray | null;
  while ((match = exportedHandlerPattern.exec(fileContent)) !== null) {
    if (!hasAuthCheck) {
      const before = fileContent.slice(0, match.index);
      const lineNumber = before.split('\n').length;
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      findings.push({
        findingId: `unprotected_api_endpoint:${filePath}:${lineNumber}`,
        ruleId: 'unprotected_api_endpoint',
        severity: 'high',
        filePath,
        lineNumber,
        snippet,
        fix: 'Add authentication to this API route. Verify the user session at the start of the handler before processing any data.',
      });
    }
  }

  return findings;
}

function computeSecurityScore(findings: SecurityFinding[]): number {
  const weights: Record<SecurityFindingSeverity, number> = {
    critical: 25,
    high: 10,
    medium: 3,
    low: 1,
    info: 0,
  };
  const penalty = findings.reduce((acc, f) => acc + (weights[f.severity] ?? 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

// --- Local directory walker ---

const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|java|php|cs)$/;
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.turbo', 'coverage']);

async function walkDir(dir: string, root: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.isDirectory()) continue;
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      const nested = await walkDir(fullPath, root);
      files.push(...nested);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/** Scans local source files in `dir` and returns findings + summary. No network I/O. */
export async function scanLocalDirectory(dir: string): Promise<LocalScanResult> {
  const allFiles = await walkDir(dir, dir);
  const findings: SecurityFinding[] = [];

  await Promise.all(
    allFiles.map(async (absolutePath) => {
      const relPath = relative(dir, absolutePath).replace(/\\/g, '/');
      let content: string;
      try {
        content = await readFile(absolutePath, 'utf8');
      } catch {
        return;
      }

      const fileFindings = [
        ...scanForHardcodedSecrets(content, relPath),
        ...scanForRlsBypassVulnerabilities(content, relPath),
        ...scanForExposedAdminRoutes(content, relPath),
        ...scanForUnprotectedApiEndpoints(content, relPath),
      ];

      findings.push(...fileFindings);
    }),
  );

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const lowCount = findings.filter((f) => f.severity === 'low').length;
  const rlsBypassCount = findings.filter((f) => f.ruleId.startsWith('rls_bypass')).length;
  const apiAuthCount = findings.filter((f) => f.ruleId.startsWith('unprotected_api')).length;
  const securityScore = computeSecurityScore(findings);

  return {
    findings,
    summary: {
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      rlsBypassCount,
      apiAuthCount,
      securityScore,
      filesScanned: allFiles.length,
    },
  };
}
