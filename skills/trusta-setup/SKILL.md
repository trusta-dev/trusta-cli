---
name: trusta-setup
description: Set up Trusta for this project — authenticate, create workspace/project/collector, write GitHub Actions workflow.
---

# trusta-setup

Set up Trusta for this project. Authenticate, create workspace/project/collector, and write the GitHub Actions workflow file.

## Steps

### 1. Check prerequisites

Run: `which trusta || npx trusta --version`

If `trusta` is not installed globally, use `npx trusta` for all subsequent commands.

### 2. Check authentication

Run: `trusta whoami` (or `npx trusta whoami`)

If the command fails or returns an error:
- Run `trusta auth` (or `npx trusta auth`) to open the browser login flow
- Wait for the user to complete authentication
- Confirm success with `trusta whoami`

### 3. Check if the project is already linked

Run: `trusta project resolve --json` (or `npx trusta project resolve --json`)

- If it succeeds and returns `{ id, name, slug }`, the repo is already linked. Skip to step 5 — do NOT run `trusta init`.
- If it fails with a "not found" or "not linked" error, continue to step 4.

### 4. Run trusta init (only if not already linked)

`trusta init` is interactive — it prompts for workspace name, project name, etc. Do NOT run it yourself. Tell the user:

> This repo isn't linked to a Trusta project yet. Run `trusta init` in your terminal to set it up, then come back and run `/trusta-setup` again.

Stop here and wait for the user to re-invoke the skill after completing init.

### 5. Check the GitHub Actions workflow

Check whether `.github/workflows/trusta.yml` already exists.

If it already exists, leave it as-is and tell the user it's in place.

If it does not exist, tell the user:
> The workflow file is missing. Get it from your Trusta dashboard under Setup, copy the YAML, and save it to `.github/workflows/trusta.yml`.

### 6. Done

Report:
- Project name and trust page URL (`https://trust.trusta.dev/[slug]`)
- Whether the workflow file was written or already existed
- Next step: add `TRUSTA_COLLECTOR_SECRET` as a GitHub Actions secret (Settings → Secrets and variables → Actions) if not already done, then push a commit to trigger a scan
