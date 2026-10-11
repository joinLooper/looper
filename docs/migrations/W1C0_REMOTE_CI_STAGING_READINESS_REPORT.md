# W1C0 Remote CI & Staging Readiness Report

## Decision

**W1C0 PARTIAL — DECISION REQUIRED**

The W1B branch was preserved remotely at the requested HEAD with a clean worktree. The hosted CI workflow contains the W1B checks, but its trigger is pull_request or a push to main; no hosted run exists for this feature branch, so hosted validation cannot be declared PASS. The isolated PG adapter test is reproducible and exposes deployment blockers in the synchronous bridge. Supabase staging research is complete without creating resources, but region, spend, project choice, and the async adapter require central decisions.

## Source and preservation

- Source branch: codex/app-w1b-postgres-parity
- Preserved W1B HEAD: 5340a531b5b6880b78bcd435c261f889b93bfd2f
- Remote comparison: git ls-remote matched local HEAD after a normal push.
- Working tree at Gate A: clean.
- Existing W1B evidence: 13 files under docs/migrations/W1B_EVIDENCE/, plus W1B reports and validation JSON.
- No force push, rebase, squash, main merge, or history rewrite.

## Gate B

Configured checks include frozen install, lint, typecheck, production builds, API/frontend/PostgreSQL parity, browser capture, and cleanup. GitHub API returned zero runs for the branch after push; this is configured, remotely unverified.

## Gate C

The local isolated readiness run covers health, event-loop blocking, database/API latency, small-load throughput, lifecycle, failure/restart, and graceful shutdown. Mechanical lifecycle checks passed, but the synchronous bridge is unsuitable for direct App API deployment until replaced by an async bounded-pool boundary with cancellation and drain semantics.

## Gate D

Independent Looper staging, Supabase branch, and existing local portable PG17 were compared. Independent staging is the recommended future choice because it avoids coupling to any existing project. Costs, regions, pooling, backups, secrets, schema/API exposure, grants/RLS, CI isolation, and migration prerequisites are in W1C0_SUPABASE_STAGING_OPTIONS.md.

## Scope guard

No Supabase resource, paid branch, production migration, data migration, dual-write, Auth migration, mobile/native app, gameplay/economy, Forest/Treehouse, or Character Canon work was started.
