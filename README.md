# trusta

Generate your trust page in minutes.

```bash
npx trusta init
```

## What it does

- Detects your project name, GitHub repo, and framework
- Creates a Trusta workspace and project
- Runs a local security scan (hardcoded secrets, exposed routes, RLS bypasses, unprotected API endpoints)
- Submits findings as evidence to your trust page
- Outputs a GitHub Actions snippet and collector secret ready to paste

## Requirements

- Node.js 18+
- A [Trusta](https://trusta.dev) account (free)

## Usage

```bash
npx trusta init
```

You'll be prompted for:
1. Your API token (get it at [app.trusta.dev/app/settings/tokens](https://app.trusta.dev/app/settings/tokens))
2. Workspace name
3. Project name

## Environment variables

| Variable | Description |
|---|---|
| `TRUSTA_API_TOKEN` | Skip the token prompt |
| `TRUSTA_API_URL` | Override API base URL (default: `https://api.trusta.dev`) |
| `TRUSTA_APP_URL` | Override app base URL (default: `https://app.trusta.dev`) |

## License

MIT
