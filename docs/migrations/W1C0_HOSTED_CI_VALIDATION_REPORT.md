# W1C0 Hosted CI Validation Report

## Gate B result

The existing workflow is .github/workflows/ci.yml.

- pull_request triggers the workflow.
- push triggers only for main.
- A normal push of codex/app-w1b-postgres-parity therefore does not start a run by itself.
- GitHub Actions API returned total_count 0 for this branch after push.
- No pull request was created by this preflight, so there is no hosted Linux run to validate.

The workflow definition contains frozen pnpm install, SQLite migration, lint, typecheck, isolated PostgreSQL 17 start, root API/frontend/PostgreSQL tests, production builds, browser capture, artifact upload, and normal PostgreSQL stop. Because no hosted run exists for this branch, these checks are configured but remotely unverified in W1C0. This gate is not a PASS.

No assertion, failure case, business rule, or CI security boundary was weakened.
