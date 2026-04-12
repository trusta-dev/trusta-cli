import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const AUTH_CALLBACK_PORT = 7429;
const AUTH_CALLBACK_URI = `http://localhost:${AUTH_CALLBACK_PORT}/callback`;
const DEFAULT_AUTH_DOMAIN = 'https://auth.trusta.dev';
// Filled in after CDK AuthStack deploy — override with TRUSTA_COGNITO_CLI_CLIENT_ID for local dev.
const DEFAULT_CLI_CLIENT_ID = '5mksb84rlot54m2h5u67f8o9rc';
const LOGIN_TIMEOUT_MS = 120_000;

interface StoredAuth {
  idToken: string;
  idTokenExpiresAt: string;
  refreshToken: string | null;
}

function getConfigPath(): string {
  return join(homedir(), '.trusta', 'config.json');
}

function loadStoredAuth(): StoredAuth | null {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as StoredAuth;
  } catch {
    return null;
  }
}

function saveStoredAuth(auth: StoredAuth): void {
  const configPath = getConfigPath();
  mkdirSync(join(homedir(), '.trusta'), { recursive: true });
  writeFileSync(configPath, JSON.stringify(auth, null, 2) + '\n', 'utf8');
}

function hasExpired(auth: StoredAuth): boolean {
  return Date.parse(auth.idTokenExpiresAt) <= Date.now() + 60_000;
}

function parseJwtExp(token: string): string {
  const [, payload] = token.split('.');
  if (!payload) {
    return new Date(Date.now() + 3600 * 1000).toISOString();
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    if (typeof decoded['exp'] === 'number') {
      return new Date(decoded['exp'] * 1000).toISOString();
    }
  } catch {
    // fall through
  }
  return new Date(Date.now() + 3600 * 1000).toISOString();
}

function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

async function exchangeCodeForTokens(
  authDomain: string,
  clientId: string,
  code: string,
  codeVerifier: string,
): Promise<StoredAuth> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: AUTH_CALLBACK_URI,
    code_verifier: codeVerifier,
  });

  const response = await fetch(`${authDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  const tokens = (await response.json()) as Record<string, unknown>;
  const idToken = tokens['id_token'] as string;
  const refreshToken = (tokens['refresh_token'] as string | undefined) ?? null;

  return {
    idToken,
    idTokenExpiresAt: parseJwtExp(idToken),
    refreshToken,
  };
}

async function refreshIdToken(
  authDomain: string,
  clientId: string,
  refreshToken: string,
): Promise<StoredAuth> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  });

  const response = await fetch(`${authDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const tokens = (await response.json()) as Record<string, unknown>;
  const idToken = tokens['id_token'] as string;
  // Cognito does not return a new refresh token on refresh — reuse the existing one
  return {
    idToken,
    idTokenExpiresAt: parseJwtExp(idToken),
    refreshToken,
  };
}

async function browserLoginFlow(
  authDomain: string,
  clientId: string,
): Promise<StoredAuth> {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  const state = randomBytes(16).toString('base64url');

  const authUrl =
    `${authDomain}/oauth2/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(AUTH_CALLBACK_URI)}` +
    `&scope=${encodeURIComponent('openid email profile')}` +
    `&state=${encodeURIComponent(state)}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256`;

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${AUTH_CALLBACK_PORT}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Login failed.</h2><p>You can close this tab.</p></body></html>');
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Invalid callback.</h2><p>You can close this tab.</p></body></html>');
        server.close();
        reject(new Error('Invalid OAuth callback — state mismatch or missing code.'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body><h2>Login successful!</h2><p>You can close this tab and return to the terminal.</p></body></html>',
      );
      server.close();

      exchangeCodeForTokens(authDomain, clientId, code, codeVerifier)
        .then(resolve)
        .catch(reject);
    });

    server.listen(AUTH_CALLBACK_PORT, '127.0.0.1', () => {
      process.stdout.write(
        `\n  Opening browser for login...\n  If nothing opens, visit:\n  ${authUrl}\n\n`,
      );
      openBrowser(authUrl);
    });

    server.on('error', (err) => {
      reject(new Error(`Could not start local auth server: ${err.message}`));
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Login timed out after 120 seconds.'));
    }, LOGIN_TIMEOUT_MS);

    // Ensure the timeout doesn't keep the process alive if something else resolves first
    timeout.unref();
  });
}

/**
 * Resolves a valid Trusta API token for use in CLI commands.
 *
 * Priority:
 * 1. TRUSTA_API_TOKEN env var (headless/CI escape hatch)
 * 2. Stored token in ~/.trusta/config.json (if not expired)
 * 3. Silent refresh via stored refresh token
 * 4. Browser-based OAuth login flow
 */
export async function resolveToken(): Promise<string> {
  const envToken = process.env['TRUSTA_API_TOKEN'];
  if (envToken) {
    return envToken;
  }

  const authDomain =
    process.env['TRUSTA_AUTH_DOMAIN'] ?? DEFAULT_AUTH_DOMAIN;
  const clientId =
    process.env['TRUSTA_COGNITO_CLI_CLIENT_ID'] ?? DEFAULT_CLI_CLIENT_ID;

  const stored = loadStoredAuth();

  if (stored && !hasExpired(stored)) {
    return stored.idToken;
  }

  if (stored?.refreshToken) {
    try {
      const refreshed = await refreshIdToken(
        authDomain,
        clientId,
        stored.refreshToken,
      );
      saveStoredAuth(refreshed);
      return refreshed.idToken;
    } catch {
      // Refresh failed — fall through to browser login
    }
  }

  const fresh = await browserLoginFlow(authDomain, clientId);
  saveStoredAuth(fresh);
  return fresh.idToken;
}
