# trusta-fix

Fix security findings from the latest Trusta scan to maximise the trust score, then open a PR.

## Score formula

`score = 100 - min(critical × 15 + high × 8, 80)`

Fix all critical and high findings. Medium/low/info only if score is already 100 after fixing critical+high.

## Steps

### 1. Resolve the project

Run: `trusta project resolve --json` (or `npx trusta project resolve --json`)

This returns `{ id, name, slug }` for the Trusta project linked to the current repo's git remote.

If the command exits with an error, ask the user to run `/trusta-setup` first.

### 2. Fetch latest scan findings

Run: `trusta scan latest --json` (or `npx trusta scan latest --json`)

This returns a JSON object with `job` (scan metadata) and `findings` (array of finding objects).
Extract all findings with severity `critical` or `high`.

If there are no completed scans, tell the user to run a scan first from the dashboard or by pushing a commit, then re-run `/trusta-fix`.

### 3. Compute what needs fixing

Calculate the current score. List all critical findings first, then high. Determine the minimum set needed to reach 100/100 (fix all critical + high — their combined deduction is what drives the score down).

Show the user a summary before making any changes:
```
Current score: X/100
Findings to fix:
  [CRITICAL] path/to/file.ts:42 — hardcoded_secret
  [HIGH]     path/to/file.ts:99 — sql_injection
  ...
This will bring the score to 100/100.
Proceed? (y/n)
```

### 4. Fix the findings

For each finding, read the `filePath`, `lineNumber`, `snippet`, and `fix` fields.

Apply the fix using your code editing tools:
- **hardcoded_secret / hardcoded_api_key**: Replace the literal value with an environment variable reference. Add the variable name to `.env.example` (not `.env`).
- **sql_injection**: Parameterise the query.
- **missing_csp_header / missing_hsts_header / missing_x_frame_options**: Add the header in the appropriate config file (next.config.ts, express middleware, nginx config, etc.).
- **cors_wildcard**: Narrow the CORS origin to the specific allowed domain.
- **missing_https_redirect**: Add redirect middleware or config.
- **prompt_injection**: Add input sanitisation before passing user input to the LLM.
- **insecure_jwt**: Switch to a strong algorithm (RS256 or HS256 with a strong secret).
- **path_traversal**: Add path normalisation and boundary check.
- For any other finding: use the `fix` field from the finding as the instruction.

If a fix requires a value you cannot infer (e.g. what domain to allow in CORS), use a clearly-named placeholder like `process.env.ALLOWED_ORIGIN` and add a TODO comment.

### 5. Create the branch and PR

```bash
git checkout -b fix/trusta-security-findings
git add -A
git commit -m "fix(security): resolve critical and high findings — score $(score)/100 → 100"
git push origin fix/trusta-security-findings
gh pr create \
  --title "fix(security): resolve Trusta findings → 100/100" \
  --body "$(cat <<'EOF'
## Summary

Fixes all critical and high security findings identified by Trusta to bring the trust score to 100/100.

**Before:** $(current_score)/100
**After:** 100/100

## Findings fixed

$(list_of_fixed_findings)

## Next steps

- Review the changes
- Set any placeholder environment variables (marked with TODO)
- Merge and push to trigger a fresh Trusta scan to confirm the score

🔒 Resolved by [Trusta](https://trusta.dev)
EOF
)"
```

If `gh` is not available, print the branch name and ask the user to open the PR manually.

### 6. Report

Tell the user:
- How many findings were fixed
- The PR URL
- That they should set any placeholder env vars before merging
- That a new scan will run automatically after the PR is merged
