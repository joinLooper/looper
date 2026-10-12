# W1C1-A.2 MVP Load Scheduler Final Closure

## Decision

**W1C1-A.2 PASS — READY FOR CENTRAL REVIEW**

This package fixes only the test scheduler in `scripts/test-w1c1a1-mvp-load.mjs`. The Async PostgreSQL Adapter, persistence business logic, Store, Gameplay, Economy, Forest, Treehouse, Character Canon V2, Supabase, and Native App were not changed.

## Source and CI

- Branch: `codex/app-w1c1-async-foundation`
- Pull request: [#44](https://github.com/joinLooper/looper/pull/44), draft and unmerged
- Scheduler implementation HEAD: `fc8ab98bf8c52e2c0e152683da4992c36117991a`
- Hosted Linux CI: [run 38266246559 attempt 2](https://github.com/joinLooper/looper/actions/runs/38266246559/attempts/2)
- Job: `verify` / `114870631746`
- Trigger: `pull_request`
- PostgreSQL: isolated disposable PostgreSQL 17
- Result: success

The final documentation commit is pushed after the implementation commit. The hosted rerun above validates the scheduler implementation; the final documentation HEAD is a docs-only follow-up and is also revalidated by the CI trigger for that HEAD.

## Scheduler correction

The old harness called `work(index)` for all 24 indexes before slicing the already-running promises. That was retained in [the original evidence](C:/Users/deyi2/OneDrive/文件/ChatGPT/Looper%20App｜正式產品開發/docs/migrations/W1C1A1_MVP_LOAD_RESULTS.json) with `validationStatus: INVALID_CONCURRENCY_SCHEDULING`.

The corrected harness uses lazy bounded worker loops. A worker claims the next index only after it has a configured slot, then calls `work(index)`. Each scenario records `configuredConcurrency`, `activeWork`, `actualMaxActiveWork`, and `schedulerViolation`. It fails the scenario if the active peak exceeds the configured limit; concurrency 1 additionally requires an actual peak of exactly 1.

## Matrix result

The full matrix contains 48 scenarios and 24 synthetic requests per scenario:

- pool sizes: 1, 2, 4
- concurrency: 1, 5, 10, 20
- read, write, mixed
- writer contention
- pool saturation

Hosted result: **48/48 PASS**, zero scheduler violations, zero unexpected errors, and zero post-drain leaks. All nine concurrency-1 scenarios recorded `actualMaxActiveWork = 1`; the maximum observed active work was 20 only where configured concurrency was 20. Saturation timeouts remain separately counted as `expectedTimeouts` and are not counted as successful transactions.

## Regression

- API: 315/315
- Frontend: 129/129
- PostgreSQL parity: 44/44
- Baseline: 488/488
- Async foundation: 15/15
- Lint: PASS
- Typecheck: PASS
- Production build: PASS
- Browser capture: PASS
- PostgreSQL runtime cleanup: PASS

The first attempt of the Hosted run reproduced the known timing-sensitive cookie assertion failure. It was not changed or weakened. The official rerun passed, and the existing cookie evidence remains archived as a known flaky observation.

## Scope confirmation

No product behavior changed. No adapter defect was found. No Supabase project, production migration, Native App, or W1C1-B work was started. PR #44 remains draft and unmerged.

Artifacts:

- `W1C1A2_CLOSURE_REPORT.md`
- `W1C1A2_LOAD_RESULTS.json`
- `W1C1A2_HOSTED_CI_RESULTS.json`
- `W1C1A2_VALIDATION_RESULTS.json`
