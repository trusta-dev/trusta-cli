## [0.4.4](https://github.com/trusta-dev/trusta-cli/compare/v0.4.3...v0.4.4) (2026-04-13)


### Bug Fixes

* improve network error messages — show hostname and underlying cause ([d8258da](https://github.com/trusta-dev/trusta-cli/commit/d8258dabd92ecc4cf2a07c661f57757e1e93bd3f))

## [0.4.3](https://github.com/trusta-dev/trusta-cli/compare/v0.4.2...v0.4.3) (2026-04-12)


### Bug Fixes

* detect existing project by repo URL before creating a new one ([f5b4144](https://github.com/trusta-dev/trusta-cli/commit/f5b41440d9273f29cd1ea98ebaab82aca4f5930e))

## [0.4.2](https://github.com/trusta-dev/trusta-cli/compare/v0.4.1...v0.4.2) (2026-04-12)


### Bug Fixes

* correct trust page URL — remove /trust/ prefix, use appUrl not hardcoded default ([fbf3b0d](https://github.com/trusta-dev/trusta-cli/commit/fbf3b0d88edf630e6a225333d3d78e4df6bd6626))

## [0.4.1](https://github.com/trusta-dev/trusta-cli/compare/v0.4.0...v0.4.1) (2026-04-12)


### Bug Fixes

* handle existing workspace in init — skip bootstrap, add project to existing org ([738a441](https://github.com/trusta-dev/trusta-cli/commit/738a441dfe144a53afad86560a3aecb4f057fba7))

# [0.4.0](https://github.com/trusta-dev/trusta-cli/compare/v0.3.0...v0.4.0) (2026-04-12)


### Features

* set production Cognito CLI client ID ([dde93cd](https://github.com/trusta-dev/trusta-cli/commit/dde93cdaae8b37f9e8dd9d5132937f62504218eb))

# [0.3.0](https://github.com/trusta-dev/trusta-cli/compare/v0.2.0...v0.3.0) (2026-04-12)


### Features

* browser OAuth login flow with PKCE and token persistence ([03d78d7](https://github.com/trusta-dev/trusta-cli/commit/03d78d7082a932cfda61a130ebe94a3c9f879cc8))

# [0.2.0](https://github.com/trusta-dev/trusta-cli/compare/v0.1.0...v0.2.0) (2026-03-30)


### Features

* add trust attestation step to init command ([4f9d75e](https://github.com/trusta-dev/trusta-cli/commit/4f9d75e811a80ccb491e4e5cbcc0fb87de468768))

# Changelog

All notable changes to this project will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-03-22

### Added
- `npx trusta init` — interactive setup command
- Project detection (name, GitHub repo URL, framework)
- Local security scanner: hardcoded secrets, RLS bypass vulnerabilities, exposed admin routes, unprotected API endpoints
- Security findings submitted as evidence to your Trusta project
- GitHub Actions YAML snippet generated on completion
- GitHub repo auto-linked to project for push webhook scans
