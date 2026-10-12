# W1C1-A.1 Baseline Closure Report

## Decision

**W1C1-A.1 PASS — READY FOR CENTRAL REVIEW**

This targeted closure only adds hosted execution for the existing async foundation checks, a small traffic infrastructure profile, and archival evidence for the historical cookie timing failure. It does not modify Store business logic, gameplay, economy, Forest, Treehouse, Character Canon V2, Supabase, or Native App work.

## Source and hosted evidence

- Branch: `codex/app-w1c1-async-foundation`
- Implementation commit validated by Hosted CI: `52c942c7b5164c14ca9014bb71d41998689c506a`
- Hosted workflow: [CI run 38254481283](https://github.com/joinLooper/looper/actions/runs/38254481283)
- Job: `verify` / `114828889344`
- Trigger: `pull_request` for PR #44, base `codex/welcome-first-resident`
- Result: success on Ubuntu hosted Linux with the isolated pinned PostgreSQL 17 runtime

The final documentation commit is intentionally separate from the implementation commit. It contains only the report and downloaded result records; the hosted run above is the execution evidence for the behavior-changing closure commit.

## Changes

1. `scripts/test-w1c1-async-foundation.mjs` now accepts the CI credential file, rejects anything except the disposable loopback PG17 identity, creates the test-only control metadata when running standalone, uses a process-scoped schema, removes that schema and allocator row, and writes an aggregate result without changing the 15 assertions.
2. `scripts/test-w1c1a1-mvp-load.mjs` adds the infrastructure-only matrix. It measures p50/p95 latency, event-loop delay, acquire wait, advisory writer-lock wait, CPU, RSS, pool counts, expected saturation timeouts, and post-drain leaks. The probe table is synthetic and dropped at the end.
3. `package.json` exposes `qa:async-mvp-load`; `.github/workflows/ci.yml` runs and uploads async and load evidence after the existing 488 baseline and before build/runtime capture.
4. `docs/migrations/W1C1A1_EVIDENCE/CookieTimingEvidence.*` preserves the first failed attempt, successful rerun, original assertion, relevant sanitized log excerpt, run/job URLs, and SHA-256 hashes of the raw downloaded logs. The test and assertion were not changed.

## Hosted results

The existing baseline remains a separate authority:

| Suite | Result |
| --- | ---: |
| API | 315 / 315 |
| Frontend | 129 / 129 |
| PostgreSQL parity | 44 / 44 |
| Baseline total | **488 / 488** |
| Async foundation | **15 / 15** |

Hosted lint, typecheck, production build, browser runtime capture, and PostgreSQL runtime cleanup all passed. The async suite is not counted inside 488.

The load profile ran 48 scenarios: pool sizes 1, 2, and 4; concurrency 1, 5, 10, and 20; read, write, mixed, writer-lock contention, and pool saturation. Each cell used 24 synthetic requests. Saturation timeouts are recorded as expected observations; unexpected errors were zero and every pool drained with zero remaining connections. This validates only the async infrastructure at MVP-scale traffic. It is not a test of the complete App API and does not mean 200 concurrent users are supported.

## Cookie timing evidence

Run `38186185306` used commit `803cd5fedff29af352998072a3c806c65b8d8697`. Attempt 1 failed at `apps/api/src/app.test.ts:4015` because `/Max-Age=6047\d\d/i` did not match the observed `Max-Age=604800`. Attempt 2 of the same run passed the test and the full 488 baseline. The original assertion remains unchanged; this is archived as a timing-sensitive flaky observation, not a claim that its cause is fixed.

## Regression and scope

No product behavior changed. The implementation commit contains no changes to persistence business rules, rewards, economy, gameplay, Forest, Treehouse, or Character Canon. No Supabase resource, production database, data migration, Auth migration, Native App, or W1C1-B work was started.

Known non-blocking hosted annotations are the GitHub Actions Node 20 deprecation notice and the scheduled `ubuntu-latest` image migration. Neither affected the successful result. The cookie timing issue remains a known flaky evidence item and must continue to be monitored.

Result records:

- `W1C1A1_HOSTED_ASYNC_RESULTS.json`
- `W1C1A1_MVP_LOAD_RESULTS.json`
- `W1C1A1_REGRESSION_RESULTS.json`
