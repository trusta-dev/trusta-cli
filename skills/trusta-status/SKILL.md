# trusta-status

Show the current Trusta trust score, latest scan results, and check states for this project.

## Steps

### 1. Check authentication

Run: `trusta whoami` (or `npx trusta whoami`)

If not authenticated, tell the user to run `/trusta-setup` first.

### 2. Fetch status

Run: `trusta status --json` (or `npx trusta status --json`)

The JSON output contains: `project`, `score`, `latestScan` (with `criticalCount`, `highCount`, `findingsCount`, `findings`), and `checks` (pass/fail/stale counts).

Extract and display:
- Project name and trust page URL
- Current trust score (score formula: `100 - min(critical × 15 + high × 8, 80)`)
- Latest scan: date, status, findings breakdown by severity
- Check states: how many passing, failing, stale

### 3. Format the output

Present a clean summary:

```
Trusta — [project name]
Trust score:  XX/100  [●●●●●○○○○○]
Trust page:   https://trust.trusta.dev/[slug]

Latest scan ([date]):
  Critical   X   (−Xpts each)
  High       X   (−8pts each)
  Medium     X
  Low        X

Trust checks:
  ✓  X passing
  ✗  X failing
  ~  X stale

Run /trusta-fix to resolve findings and reach 100/100.
```

If there are no scans yet, tell the user to push a commit or run a scan from the dashboard.

If the score is already 100/100, celebrate: "✓ Perfect score — your trust profile is clean."
