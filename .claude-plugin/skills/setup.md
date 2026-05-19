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

### 3. Run trusta init

Run: `trusta init` (or `npx trusta init`)

This will:
- Create or link a workspace and project
- Create a GitHub Actions collector credential
- Link this repo to the project
- Run a local security scan
- Output the GitHub Actions YAML and the collector secret

Capture the full output. Extract:
- The collector secret (labelled `TRUSTA_COLLECTOR_SECRET` in the output)
- The GitHub Actions YAML block

### 4. Write the GitHub Actions workflow

Create `.github/workflows/trusta.yml` with the GitHub Actions YAML from step 3.

If `.github/workflows/trusta.yml` already exists, show the user the diff and ask before overwriting.

### 5. Remind about the GitHub secret

Tell the user:
> Add `TRUSTA_COLLECTOR_SECRET` as a GitHub Actions secret in your repo settings:
> Settings → Secrets and variables → Actions → New repository secret

Show them the secret value from step 3.

### 6. Done

Report:
- Project name and dashboard URL
- Trust page URL
- Whether the workflow file was written
- Next step: push a commit to trigger the first automated scan
