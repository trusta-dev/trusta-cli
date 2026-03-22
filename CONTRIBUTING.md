# Contributing to trusta-cli

Thanks for your interest in contributing! Here's everything you need to get started.

## Development setup

```bash
git clone https://github.com/trusta-dev/trusta-cli.git
cd trusta-cli
npm install
npm run build
```

To test the CLI locally against your own project:

```bash
node dist/index.js init
```

## Project structure

```
src/
├── index.ts          # Entry point — parses argv, routes to command
├── api.ts            # Trusta API client (fetch-based, no deps)
├── detect.ts         # Project detection (name, GitHub URL, framework)
├── output.ts         # Terminal output helpers (colors, banners)
├── prompt.ts         # readline-based interactive prompts
├── scanner.ts        # Local security scanner (pure regex rules)
└── commands/
    └── init.ts       # `trusta init` command implementation
```

## Adding a scanning rule

Rules live in `src/scanner.ts`. Each rule is a pure function:

```typescript
function scanForMyRule(filePath: string, lines: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const [index, line] of lines.entries()) {
    if (/my-pattern/.test(line)) {
      findings.push({
        ruleId: 'my_rule_id',
        severity: 'high',
        filePath,
        lineNumber: index + 1,
        snippet: line.trim().slice(0, 120),
        fix: 'Explanation of how to fix this.',
      });
    }
  }
  return findings;
}
```

Then add it to the `RULES` array at the bottom of `scanner.ts`.

## Submitting changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run typecheck` and `npm run build` — both must pass
4. Open a pull request with a clear description

## Reporting issues

Open an issue at https://github.com/trusta-dev/trusta-cli/issues. Include:
- Node.js version (`node --version`)
- OS
- The command you ran and the full error output

## Release process

Releases are managed by the maintainers. Versions follow [semver](https://semver.org). A new npm publish is triggered automatically when a `v*` tag is pushed to `main`.
