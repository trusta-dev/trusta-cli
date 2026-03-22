# trusta

[![npm version](https://img.shields.io/npm/v/trusta)](https://www.npmjs.com/package/trusta)
[![CI](https://github.com/trusta-dev/trusta-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/trusta-dev/trusta-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Generate your trust page in minutes.

```bash
npx trusta init
```

## What it does

1. Detects your project name, GitHub repo, and framework
2. Creates a Trusta workspace and project at [trusta.dev](https://trusta.dev)
3. Runs a local security scan across your codebase:
   - Hardcoded secrets (API keys, tokens, credentials)
   - Supabase RLS bypass vulnerabilities
   - Exposed admin routes with client-side auth checks
   - Unprotected API endpoints
4. Submits findings as evidence — they contribute to your public trust score
5. Links your GitHub repo so every push triggers an automatic re-scan
6. Outputs a ready-to-paste GitHub Actions snippet

## Requirements

- Node.js 18 or later
- A [Trusta](https://trusta.dev) account (free)

## Usage

```bash
npx trusta init
```

You'll be prompted for:
1. Your API token — get it at [app.trusta.dev/app/settings/tokens](https://app.trusta.dev/app/settings/tokens)
2. Workspace name (your company or app name)
3. Project name

## Environment variables

| Variable | Description |
|---|---|
| `TRUSTA_API_TOKEN` | Skip the token prompt in CI |
| `TRUSTA_API_URL` | Override API base URL (default: `https://api.trusta.dev`) |
| `TRUSTA_APP_URL` | Override app base URL (default: `https://app.trusta.dev`) |

## How the security score works

Each scan checks your codebase against four rules. Findings map directly to trust controls on your public trust page:

| Rule | Trust control |
|---|---|
| No hardcoded secrets | `security.no_hardcoded_secrets` |
| No RLS bypass | `security.rls_policies_enforced` |
| No exposed admin routes | `security.no_exposed_admin_routes` |
| No unprotected API endpoints | `security.no_unprotected_api_routes` |

Security contributes 25% of the overall trust score.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — adding new scanning rules is a great first contribution.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities responsibly.

## License

[MIT](LICENSE) © [Trusta](https://trusta.dev)
