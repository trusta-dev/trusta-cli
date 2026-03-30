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
