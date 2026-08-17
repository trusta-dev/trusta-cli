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
  readonly promptInjectionCount: number;
  readonly insecureLlmOutputCount: number;
  readonly missingTokenLimitCount: number;
  readonly sensDataInPromptCount: number;
  readonly excessiveAgencyCount: number;
  readonly ssrfCount: number;
  readonly unpinnedAiDepCount: number;
  readonly weakCryptoCount: number;
  readonly commandInjectionCount: number;
  readonly insecureJwtCount: number;
  readonly insecureDeserializationCount: number;
  readonly pathTraversalCount: number;
  readonly prototypePollutionCount: number;
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
  {
    ruleId: 'hardcoded_github_pat',
    pattern: /\bghp_[a-zA-Z0-9]{36}\b/g,
    severity: 'critical',
    fix: 'Remove this GitHub PAT from source code and rotate it immediately at https://github.com/settings/tokens. Store it in an environment variable instead.',
  },
  {
    ruleId: 'hardcoded_jwt_secret',
    pattern: /(?:JWT_SECRET|jwt_secret|jwtSecret|JWT_SIGNING_SECRET|nextauth_secret|NEXTAUTH_SECRET)\s*[=:]\s*["']([^"']{8,})["']/g,
    severity: 'critical',
    fix: 'Move this JWT secret to an environment variable. Anyone who reads your source code can forge authentication tokens with a hardcoded secret.',
  },
  {
    ruleId: 'hardcoded_db_connection_string',
    pattern: /(?:mongodb|postgres|postgresql|mysql|redis):\/\/[^:@\s"'`]+:[^@\s"'`]{4,}@[^/\s"'`]/g,
    severity: 'critical',
    fix: 'Move this database connection string to an environment variable. Hardcoded credentials expose your database to anyone who can read the source code.',
  },
  {
    ruleId: 'hardcoded_sendgrid_api_key',
    pattern: /\bSG\.[a-zA-Z0-9_-]{22,}\.[a-zA-Z0-9_-]{43,}\b/g,
    severity: 'critical',
    fix: 'Move this SendGrid API key to an environment variable (e.g. process.env.SENDGRID_API_KEY). Exposed API keys can be used to send spam or access your email data.',
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

const CORS_WILDCARD_PATTERNS = [
  /cors\s*\(\s*\{[^}]*origin\s*:\s*(?:'[*]'|"[*]"|true)/g,
  /setHeader\s*\(\s*['"]Access-Control-Allow-Origin['"]\s*,\s*['"][*]['"]\s*\)/g,
  /(?:c\.header|res\.header)\s*\(\s*['"]Access-Control-Allow-Origin['"]\s*,\s*['"][*]['"]\s*\)/g,
];

function scanForCorsMisconfigurations(fileContent: string, filePath: string): SecurityFinding[] {
  const CORS_API_PATH =
    /(route\.(ts|js)|api\/|handler\.(ts|js)|server\.(ts|js)|middleware\.(ts|js)|index\.(ts|js))/;
  if (!CORS_API_PATH.test(filePath)) return [];

  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');

  for (const pattern of CORS_WILDCARD_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(fileContent)) !== null) {
      const lineNumber = fileContent.slice(0, match.index).split('\n').length;
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      findings.push({
        findingId: `cors_wildcard_origin:${filePath}:${lineNumber}`,
        ruleId: 'cors_wildcard_origin',
        severity: 'high',
        filePath,
        lineNumber,
        snippet,
        fix: "Replace the wildcard CORS origin with an explicit allowlist of trusted domains (e.g. origin: ['https://app.yourdomain.com']). A wildcard allows any website to make credentialed requests to your API.",
      });
    }
    pattern.lastIndex = 0;
  }

  return findings;
}

const SQL_INJECTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; fix: string }> = [
  {
    pattern: /`\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s[^`]*\$\{[^}]+\}[^`]*`/gi,
    fix: 'Use parameterised queries instead of string interpolation in SQL. Pass user input as query parameters (e.g. db.query("SELECT * FROM users WHERE id = $1", [userId])) to prevent SQL injection.',
  },
  {
    pattern: /["'](?:SELECT|INSERT|UPDATE|DELETE)\s[^"']*["']\s*\+\s*(?!["'])/gi,
    fix: 'Use parameterised queries instead of string concatenation. Building SQL from user input allows attackers to execute arbitrary queries against your database.',
  },
];

function scanForSqlInjection(fileContent: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const seen = new Set<string>();

  for (const rule of SQL_INJECTION_PATTERNS) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(fileContent)) !== null) {
      const lineNumber = fileContent.slice(0, match.index).split('\n').length;
      const key = `${filePath}:${lineNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      findings.push({
        findingId: `sql_injection:${filePath}:${lineNumber}`,
        ruleId: 'sql_injection',
        severity: 'critical',
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

function scanForInsecureCookies(fileContent: string, filePath: string): SecurityFinding[] {
  const COOKIE_API_PATH =
    /(route\.(ts|js)|api\/|server\.(ts|js)|handler\.(ts|js)|middleware\.(ts|js))/;
  if (!COOKIE_API_PATH.test(filePath)) return [];

  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const cookieSetPattern = /res\.cookie\s*\(\s*["'][^"']+["']\s*,\s*[^,]+,\s*(\{[^}]*\})/g;
  let match: RegExpExecArray | null;
  while ((match = cookieSetPattern.exec(fileContent)) !== null) {
    const options = match[1] ?? '';
    const missingHttpOnly = !/httpOnly\s*:\s*true/.test(options);
    const missingSecure = !/secure\s*:\s*true/.test(options);

    if (missingHttpOnly || missingSecure) {
      const lineNumber = fileContent.slice(0, match.index).split('\n').length;
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      const missing = [
        missingHttpOnly ? 'httpOnly: true' : null,
        missingSecure ? 'secure: true' : null,
      ]
        .filter(Boolean)
        .join(' and ');
      findings.push({
        findingId: `insecure_cookie:${filePath}:${lineNumber}`,
        ruleId: 'insecure_cookie',
        severity: 'medium',
        filePath,
        lineNumber,
        snippet,
        fix: `Add ${missing} to this cookie's options. Missing httpOnly allows JavaScript to read the cookie (XSS risk). Missing secure sends the cookie over plain HTTP.`,
      });
    }
  }

  return findings;
}

// Shared guard for all LLM-specific rules
const AI_SDK_IMPORT_PATTERN =
  /from ['"](?:openai|@anthropic-ai\/sdk|ai|@ai-sdk\/|langchain|llamaindex)/;

function scanForPromptInjection(fileContent: string, filePath: string): SecurityFinding[] {
  if (!AI_SDK_IMPORT_PATTERN.test(fileContent)) return [];
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const USER_INPUT_IN_TEMPLATE =
    /`[^`]*\$\{[^}]*\b(?:req\.body|req\.params|req\.query|params\.|searchParams\.|userInput|userMessage|userPrompt)\b[^}]*\}[^`]*`/g;
  let match: RegExpExecArray | null;
  while ((match = USER_INPUT_IN_TEMPLATE.exec(fileContent)) !== null) {
    const lineNumber = fileContent.slice(0, match.index).split('\n').length;
    const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
    findings.push({
      findingId: `llm_prompt_injection:${filePath}:${lineNumber}`,
      ruleId: 'llm_prompt_injection',
      severity: 'high',
      filePath,
      lineNumber,
      snippet,
      fix: 'Sanitize and validate user input before including it in LLM prompts. Use a system/user message boundary — never concatenate raw user text into the system prompt.',
    });
  }
  USER_INPUT_IN_TEMPLATE.lastIndex = 0;
  return findings;
}

function scanForInsecureLlmOutputHandling(fileContent: string, filePath: string): SecurityFinding[] {
  if (!AI_SDK_IMPORT_PATTERN.test(fileContent)) return [];
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const DANGEROUS_SINKS: ReadonlyArray<{ pattern: RegExp }> = [
    {
      pattern:
        /dangerouslySetInnerHTML\s*=\s*\{\s*\{?\s*__html\s*:\s*\w*(?:response|completion|output|result|content|message|text)\w*/g,
    },
    { pattern: /\beval\s*\(\s*\w*(?:response|completion|output|result|content|message|text)\w*/g },
    {
      pattern:
        /new\s+Function\s*\(\s*\w*(?:response|completion|output|result|content|message|text)\w*/g,
    },
  ];
  for (const { pattern } of DANGEROUS_SINKS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(fileContent)) !== null) {
      const lineNumber = fileContent.slice(0, match.index).split('\n').length;
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      findings.push({
        findingId: `llm_insecure_output_handling:${filePath}:${lineNumber}`,
        ruleId: 'llm_insecure_output_handling',
        severity: 'high',
        filePath,
        lineNumber,
        snippet,
        fix: 'Never execute or render raw LLM output as code or HTML. Parse structured output (JSON schema / Zod) or sanitize with a library like DOMPurify before rendering.',
      });
    }
    pattern.lastIndex = 0;
  }
  return findings;
}

function scanForMissingLlmTokenLimit(fileContent: string, filePath: string): SecurityFinding[] {
  if (!AI_SDK_IMPORT_PATTERN.test(fileContent)) return [];
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const COMPLETION_CALL =
    /\b(?:chat\.completions\.create|messages\.create|generateText|streamText|createChatCompletion)\s*\(/g;
  const HAS_TOKEN_LIMIT = /\bmax(?:_tokens|Tokens|_completion_tokens|CompletionTokens)\b/;
  let match: RegExpExecArray | null;
  while ((match = COMPLETION_CALL.exec(fileContent)) !== null) {
    const window = fileContent.slice(match.index, match.index + 600);
    if (!HAS_TOKEN_LIMIT.test(window)) {
      const lineNumber = fileContent.slice(0, match.index).split('\n').length;
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      findings.push({
        findingId: `llm_missing_token_limit:${filePath}:${lineNumber}`,
        ruleId: 'llm_missing_token_limit',
        severity: 'medium',
        filePath,
        lineNumber,
        snippet,
        fix: 'Set an explicit max_tokens limit on all LLM API calls to prevent runaway costs and resource exhaustion from prompt injection attacks.',
      });
    }
  }
  COMPLETION_CALL.lastIndex = 0;
  return findings;
}

function scanForSensitiveDataInPrompt(fileContent: string, filePath: string): SecurityFinding[] {
  if (!AI_SDK_IMPORT_PATTERN.test(fileContent)) return [];
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const ENV_IN_TEMPLATE = /`[^`]*\$\{[^}]*process\.env\.[A-Z_]+[^}]*\}[^`]*`/g;
  let match: RegExpExecArray | null;
  while ((match = ENV_IN_TEMPLATE.exec(fileContent)) !== null) {
    const lineNumber = fileContent.slice(0, match.index).split('\n').length;
    const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
    findings.push({
      findingId: `llm_sensitive_data_in_prompt:${filePath}:${lineNumber}`,
      ruleId: 'llm_sensitive_data_in_prompt',
      severity: 'high',
      filePath,
      lineNumber,
      snippet,
      fix: 'Never interpolate environment variables (which may be secrets) directly into LLM prompts. Use a dedicated context-injection approach that excludes sensitive values.',
    });
  }
  ENV_IN_TEMPLATE.lastIndex = 0;
  return findings;
}

function scanForExcessiveAgency(fileContent: string, filePath: string): SecurityFinding[] {
  if (!AI_SDK_IMPORT_PATTERN.test(fileContent)) return [];
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const SHELL_OR_FS =
    /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync|writeFileSync|writeFile|unlink|unlinkSync|rmSync)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = SHELL_OR_FS.exec(fileContent)) !== null) {
    const lineNumber = fileContent.slice(0, match.index).split('\n').length;
    const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
    findings.push({
      findingId: `llm_excessive_agency:${filePath}:${lineNumber}`,
      ruleId: 'llm_excessive_agency',
      severity: 'high',
      filePath,
      lineNumber,
      snippet,
      fix: 'Autonomous AI agents must not have unconstrained access to shell execution or filesystem writes. Use allowlists, sandboxing, and human-in-the-loop approvals for destructive operations.',
    });
  }
  SHELL_OR_FS.lastIndex = 0;
  return findings;
}

function scanForSsrf(fileContent: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const FETCH_PATTERN =
    /\b(?:fetch|axios\.(?:get|post|put|delete|request)|https?\.(?:get|request))\s*\(/g;
  const USER_CONTROLLED_URL =
    /\b(?:req\.body|req\.params|req\.query|params\.|searchParams\.)\b/;
  let match: RegExpExecArray | null;
  while ((match = FETCH_PATTERN.exec(fileContent)) !== null) {
    const window = fileContent.slice(Math.max(0, match.index - 400), match.index + 400);
    if (USER_CONTROLLED_URL.test(window)) {
      const lineNumber = fileContent.slice(0, match.index).split('\n').length;
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      findings.push({
        findingId: `ssrf_user_controlled_url:${filePath}:${lineNumber}`,
        ruleId: 'ssrf_user_controlled_url',
        severity: 'high',
        filePath,
        lineNumber,
        snippet,
        fix: 'Never pass user-supplied URLs directly to fetch or HTTP clients. Validate URLs against an allowlist of trusted domains before making server-side requests.',
      });
    }
  }
  FETCH_PATTERN.lastIndex = 0;
  return findings;
}

function scanForUnpinnedAiDependencies(fileContent: string, filePath: string): SecurityFinding[] {
  if (!filePath.endsWith('package.json')) return [];
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const UNPINNED_AI_DEP =
    /["'](?:openai|@anthropic-ai\/sdk|ai|langchain|llamaindex|@ai-sdk\/[a-z-]+)["']\s*:\s*["'](?:\*|latest|next|x)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = UNPINNED_AI_DEP.exec(fileContent)) !== null) {
    const lineNumber = fileContent.slice(0, match.index).split('\n').length;
    const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
    findings.push({
      findingId: `llm_unpinned_ai_dep:${filePath}:${lineNumber}`,
      ruleId: 'llm_unpinned_ai_dep',
      severity: 'medium',
      filePath,
      lineNumber,
      snippet,
      fix: 'Pin AI SDK versions to an exact version or a tight semver range (e.g. "openai": "4.x.x") to avoid supply-chain attacks from compromised package releases.',
    });
  }
  UNPINNED_AI_DEP.lastIndex = 0;
  return findings;
}

function scanForWeakCryptography(fileContent: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const WEAK_CRYPTO: ReadonlyArray<{
    pattern: RegExp;
    severity: SecurityFindingSeverity;
    fix: string;
  }> = [
    {
      pattern: /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/gi,
      severity: 'medium',
      fix: 'Replace MD5/SHA-1 with SHA-256 or SHA-512 via createHash("sha256"). MD5 and SHA-1 are cryptographically broken and must not be used for security purposes.',
    },
    {
      pattern: /\bcreateCipher\s*\(/g,
      severity: 'high',
      fix: 'Replace createCipher with createCipheriv and supply a random IV. createCipher is deprecated and insecure because it derives the IV from the password without randomness.',
    },
    {
      pattern: /Math\.random\s*\(\s*\)[^;,)]*(?:token|secret|password|key|nonce|salt|uuid|id)/gi,
      severity: 'high',
      fix: 'Use crypto.randomBytes() or crypto.randomUUID() instead of Math.random() for security tokens, secrets, and IDs. Math.random() is not cryptographically secure.',
    },
  ];
  for (const { pattern, severity, fix } of WEAK_CRYPTO) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(fileContent)) !== null) {
      const lineNumber = fileContent.slice(0, match.index).split('\n').length;
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      findings.push({
        findingId: `weak_cryptography:${filePath}:${lineNumber}`,
        ruleId: 'weak_cryptography',
        severity,
        filePath,
        lineNumber,
        snippet,
        fix,
      });
    }
    pattern.lastIndex = 0;
  }
  return findings;
}

function scanForCommandInjection(fileContent: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const SHELL_WITH_USER_INPUT: ReadonlyArray<RegExp> = [
    /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync)\s*\(\s*`[^`]*\$\{[^}]*\b(?:req\.|params\.|searchParams\.|userInput|cmd|command)\b[^}]*\}[^`]*`/g,
    /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync)\s*\(\s*(?:['"][^'"]+['"]\s*\+[^,)]*(?:req\.|params\.|searchParams\.)|(?:req\.|params\.|searchParams\.)[^,)]*\+)/g,
  ];
  for (const pattern of SHELL_WITH_USER_INPUT) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(fileContent)) !== null) {
      const lineNumber = fileContent.slice(0, match.index).split('\n').length;
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      findings.push({
        findingId: `command_injection:${filePath}:${lineNumber}`,
        ruleId: 'command_injection',
        severity: 'critical',
        filePath,
        lineNumber,
        snippet,
        fix: 'Never interpolate user input into shell commands. Use execFile with a fixed command and an array of arguments, or validate/allowlist inputs before use.',
      });
    }
    pattern.lastIndex = 0;
  }
  return findings;
}

function scanForInsecureJwt(fileContent: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const JWT_ISSUES: ReadonlyArray<{
    pattern: RegExp;
    severity: SecurityFindingSeverity;
    fix: string;
  }> = [
    {
      pattern: /\balgorithm\s*:\s*['"]none['"]/gi,
      severity: 'critical',
      fix: 'Never set the JWT algorithm to "none". Always specify a strong algorithm (HS256, RS256) and reject tokens that use unexpected algorithms.',
    },
    {
      pattern: /\balgorithms\s*:\s*\[\s*['"]none['"]/g,
      severity: 'critical',
      fix: 'Remove "none" from the allowed algorithms list. Accepting "none" allows attackers to forge tokens without a valid signature.',
    },
    {
      pattern: /\bignoreExpiration\s*:\s*true\b/g,
      severity: 'high',
      fix: 'Remove ignoreExpiration: true. Always validate token expiration to prevent replay attacks with stolen tokens.',
    },
  ];
  for (const { pattern, severity, fix } of JWT_ISSUES) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(fileContent)) !== null) {
      const lineNumber = fileContent.slice(0, match.index).split('\n').length;
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      findings.push({
        findingId: `insecure_jwt:${filePath}:${lineNumber}`,
        ruleId: 'insecure_jwt',
        severity,
        filePath,
        lineNumber,
        snippet,
        fix,
      });
    }
    pattern.lastIndex = 0;
  }
  return findings;
}

function scanForInsecureDeserialization(fileContent: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const DESER_PATTERNS: ReadonlyArray<{ pattern: RegExp; fix: string }> = [
    {
      pattern: /\beval\s*\(\s*(?:JSON\.parse\s*\(|req\.body|req\.params|req\.query)/g,
      fix: 'Never pass parsed JSON or user input to eval(). Use JSON.parse with a schema validator (e.g. Zod) to safely consume structured data.',
    },
    {
      pattern: /new\s+Function\s*\(\s*(?:JSON\.parse\s*\(|req\.body|req\.params|req\.query)/g,
      fix: 'Never construct functions from user input or parsed JSON. This is equivalent to eval() and allows arbitrary code execution.',
    },
    {
      pattern: /\bdeserialize\s*\(\s*(?:req\.|JSON\.parse\s*\(req\.)/g,
      fix: 'Avoid deserializing untrusted data. If deserialization is required, validate the schema strictly before processing and use a safe serialization format like JSON with schema validation.',
    },
  ];
  for (const { pattern, fix } of DESER_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(fileContent)) !== null) {
      const lineNumber = fileContent.slice(0, match.index).split('\n').length;
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      findings.push({
        findingId: `insecure_deserialization:${filePath}:${lineNumber}`,
        ruleId: 'insecure_deserialization',
        severity: 'critical',
        filePath,
        lineNumber,
        snippet,
        fix,
      });
    }
    pattern.lastIndex = 0;
  }
  return findings;
}

function scanForPathTraversal(fileContent: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const PATH_TRAVERSAL_PATTERNS: ReadonlyArray<{
    pattern: RegExp;
    severity: SecurityFindingSeverity;
    fix: string;
  }> = [
    {
      pattern:
        /\b(?:readFile|readFileSync|createReadStream|writeFile|writeFileSync)\s*\(\s*(?:req\.(?:body|params|query)|params\.|searchParams\.)/g,
      severity: 'high',
      fix: 'Never use user-supplied values as filesystem paths directly. Resolve paths with path.resolve(), then verify the result starts with the expected base directory.',
    },
    {
      pattern: /\bsendFile\s*\(\s*(?:req\.(?:body|params|query)|params\.|searchParams\.)/g,
      severity: 'high',
      fix: 'Do not pass user input directly to sendFile(). Use a whitelist of allowed files or validate that the resolved path is within your static assets directory.',
    },
    {
      pattern:
        /path\.(?:join|resolve)\s*\([^)]*(?:req\.(?:body|params|query)|params\.|searchParams\.)[^)]*\)/g,
      severity: 'medium',
      fix: 'After joining paths, call path.resolve() and assert the result starts with your intended base directory to prevent directory traversal (e.g. "../../../etc/passwd").',
    },
  ];
  for (const { pattern, severity, fix } of PATH_TRAVERSAL_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(fileContent)) !== null) {
      const lineNumber = fileContent.slice(0, match.index).split('\n').length;
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      findings.push({
        findingId: `path_traversal:${filePath}:${lineNumber}`,
        ruleId: 'path_traversal',
        severity,
        filePath,
        lineNumber,
        snippet,
        fix,
      });
    }
    pattern.lastIndex = 0;
  }
  return findings;
}

function scanForPrototypePollution(fileContent: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = fileContent.split('\n');
  const MERGE_WITH_USER_INPUT: ReadonlyArray<RegExp> = [
    /Object\.assign\s*\(\s*[^,)]+,\s*(?:req\.body|req\.query|req\.params)\b/g,
    /(?:\b_\b|lodash)\.merge\s*\(\s*[^,)]+,\s*(?:req\.body|req\.query|req\.params)\b/g,
    /(?:\$|jQuery)\.extend\s*\(\s*true\s*,\s*[^,)]+,\s*(?:req\.body|req\.query|req\.params)\b/g,
  ];
  for (const pattern of MERGE_WITH_USER_INPUT) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(fileContent)) !== null) {
      const lineNumber = fileContent.slice(0, match.index).split('\n').length;
      const snippet = (lines[lineNumber - 1] ?? '').trim().slice(0, 120);
      findings.push({
        findingId: `prototype_pollution:${filePath}:${lineNumber}`,
        ruleId: 'prototype_pollution',
        severity: 'high',
        filePath,
        lineNumber,
        snippet,
        fix: 'Sanitize user-supplied objects before merging. Use Object.create(null) for dictionaries, strip __proto__, constructor, and prototype keys, or use a safe merge library that protects against prototype pollution.',
      });
    }
    pattern.lastIndex = 0;
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
const PACKAGE_JSON = /(?:^|\/)package\.json$/;
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
    } else if (entry.isFile() && (SOURCE_EXTENSIONS.test(entry.name) || entry.name === 'package.json')) {
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
        ...scanForCorsMisconfigurations(content, relPath),
        ...scanForSqlInjection(content, relPath),
        ...scanForInsecureCookies(content, relPath),
        ...scanForPromptInjection(content, relPath),
        ...scanForInsecureLlmOutputHandling(content, relPath),
        ...scanForMissingLlmTokenLimit(content, relPath),
        ...scanForSensitiveDataInPrompt(content, relPath),
        ...scanForExcessiveAgency(content, relPath),
        ...scanForSsrf(content, relPath),
        ...scanForUnpinnedAiDependencies(content, relPath),
        ...scanForWeakCryptography(content, relPath),
        ...scanForCommandInjection(content, relPath),
        ...scanForInsecureJwt(content, relPath),
        ...scanForInsecureDeserialization(content, relPath),
        ...scanForPathTraversal(content, relPath),
        ...scanForPrototypePollution(content, relPath),
      ];

      findings.push(...fileFindings);
    }),
  );

  const sourceFileCount = allFiles.filter((f) => !PACKAGE_JSON.test(f)).length;

  return {
    findings,
    summary: {
      criticalCount: findings.filter((f) => f.severity === 'critical').length,
      highCount: findings.filter((f) => f.severity === 'high').length,
      mediumCount: findings.filter((f) => f.severity === 'medium').length,
      lowCount: findings.filter((f) => f.severity === 'low').length,
      rlsBypassCount: findings.filter((f) => f.ruleId.startsWith('rls_bypass')).length,
      apiAuthCount: findings.filter((f) => f.ruleId === 'unprotected_api_endpoint').length,
      promptInjectionCount: findings.filter((f) => f.ruleId === 'llm_prompt_injection').length,
      insecureLlmOutputCount: findings.filter((f) => f.ruleId === 'llm_insecure_output_handling').length,
      missingTokenLimitCount: findings.filter((f) => f.ruleId === 'llm_missing_token_limit').length,
      sensDataInPromptCount: findings.filter((f) => f.ruleId === 'llm_sensitive_data_in_prompt').length,
      excessiveAgencyCount: findings.filter((f) => f.ruleId === 'llm_excessive_agency').length,
      ssrfCount: findings.filter((f) => f.ruleId === 'ssrf_user_controlled_url').length,
      unpinnedAiDepCount: findings.filter((f) => f.ruleId === 'llm_unpinned_ai_dep').length,
      weakCryptoCount: findings.filter((f) => f.ruleId === 'weak_cryptography').length,
      commandInjectionCount: findings.filter((f) => f.ruleId === 'command_injection').length,
      insecureJwtCount: findings.filter((f) => f.ruleId === 'insecure_jwt').length,
      insecureDeserializationCount: findings.filter((f) => f.ruleId === 'insecure_deserialization').length,
      pathTraversalCount: findings.filter((f) => f.ruleId === 'path_traversal').length,
      prototypePollutionCount: findings.filter((f) => f.ruleId === 'prototype_pollution').length,
      securityScore: computeSecurityScore(findings),
      filesScanned: sourceFileCount,
    },
  };
}
