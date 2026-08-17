# Trusta

[![CI](https://github.com/trusta-dev/trusta-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/trusta-dev/trusta-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Developer-first trust infrastructure. Live, computed, verifiable — not a
questionnaire.

## Packages

| Package | | |
|---|---|---|
| [`trusta`](packages/cli) | [![npm](https://img.shields.io/npm/v/trusta)](https://www.npmjs.com/package/trusta) | The CLI. `npx trusta init` generates your trust page. |
| [`@trusta/react`](packages/react) | [![npm](https://img.shields.io/npm/v/@trusta/react)](https://www.npmjs.com/package/@trusta/react) | Embeddable components rendering live trust status on your own site. |

```bash
npx trusta init
```

```tsx
import { TrustCenter } from '@trusta/react';

<TrustCenter org="your-org" />;
```

## Working on this

npm workspaces. Everything runs from the root:

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

To run a single workspace, use `-w`:

```bash
npm test -w @trusta/react
```

The React package also carries a contract test against the live published API.
It is opt-in, because a unit suite that fails when a network is unavailable is
one people learn to ignore:

```bash
TRUSTA_LIVE_CONTRACT=1 npm test -w @trusta/react
```

## Releases

Each package releases independently through semantic-release, with its own tag
prefix and its own changelog:

| Package | Tags |
|---|---|
| `trusta` | `v1.2.3` |
| `@trusta/react` | `react-v1.2.3` |

`semantic-release-monorepo` narrows each package's commit range to commits that
touched its directory, so a CLI fix cannot bump the version of a package sitting
in somebody else's bundle.

Conventional commits drive the version. Scope them to the package you changed
(`fix(cli):`, `feat(react):`) so the changelogs read properly.

## Security

See [SECURITY.md](SECURITY.md). `@trusta/react` runs inside other people's
applications, so it carries no runtime dependencies — React is a peer.
