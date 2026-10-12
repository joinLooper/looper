# W1C1-B Engineering Report — Read-only Async Store Slice

Status: **ENGINEERING PASS — READY FOR CENTRAL REVIEW**

This branch is intentionally limited to one read-only Store → API path. It does not begin a full async Store conversion or change any economy, gameplay, settlement, Forest, Treehouse, database migration, Supabase, or Native App behavior.

## Source and review

- Source branch: `codex/app-w1c1-async-foundation`
- Source HEAD: `e8f01555a7d42ddbc1b0b8697140bc11472bd5ee`
- Engineering branch: `codex/w1c1-b-async-readonly`
- Engineering commits: `06e0f06`, `3a24361`, `3d224ec`, `62d9652`, `580f32a`
- Draft PR: https://github.com/joinLooper/looper/pull/45
- Final hosted CI evidence: https://github.com/joinLooper/looper/actions/runs/38318761916
- Final hosted CI commit: `580f32a1b3c91bcb257331bb87ac0d6d1b689a3c`
- Hosted Backend Tests: https://github.com/joinLooper/looper/actions/runs/38318761983

## Call chain and side-effect boundary

```text
GET /missions
  -> buildApp(options.asyncMissionReadStore)
  -> AsyncMissionReadStore.listMissions()
  -> AsyncDatabase.query(SELECT ...)
  -> Mission[] response
```

The query joins only `missions`, `merchants`, and the `core` row in `economy_settings`, then maps the existing `Mission` contract. The route has no player session resolver, so it cannot touch `account_sessions.last_used_at`. The adapter exposes no `execute` or transaction call and has no lazy write, reward, ledger, idempotency, queue, or state-update path. The focused tests assert that `execute` and `withTransaction` are never called and that the SQL contains no mutation keyword.

## Test authority

The original baseline remains separate and unchanged:

- API: **315/315** (the existing `src/**/*.test.ts` authority)
- Frontend: **129/129**
- PostgreSQL parity: **44/44** in the hosted baseline gate
- Baseline total: **488/488**
- Async foundation: **15/15** in the hosted gate
- MVP true-concurrency matrix: hosted gate passed
- New read-only slice: **2/2**, run by `pnpm test:async-readonly`

The dedicated slice test was deliberately moved to `async-mission-read-store.slice.spec.ts` so adding this work does not silently change the 488-test baseline count. `.github/workflows/ci.yml` runs it as its own required step after the baseline step.

## Validation

Local direct checks passed on the engineering branch:

- API TypeScript and parity TypeScript checks
- Web, Admin, and Merchant TypeScript checks
- API 315-test baseline
- Async read-only slice 2-test gate
- Frontend 129-test baseline
- Web, Admin, and Merchant production builds

Hosted Linux run `38318761916` passed the complete `verify` job for commit `580f32a1b3c91bcb257331bb87ac0d6d1b689a3c`: frozen install, migrations, lint, typecheck, PostgreSQL 17 startup, 488 baseline, the 2-test async read-only gate, async foundation, MVP load matrix, all package builds, root build, browser installation, runtime capture, artifact upload, and PostgreSQL cleanup. Backend Tests run `38318761983` also passed for the same commit. The previous implementation run first failed only on the existing timing-sensitive merchant-cookie assertion (`Max-Age=604800` versus the `/Max-Age=6047\\d\\d/` expectation); the assertion and product code were not changed, and its rerun succeeded.

The final local closure test additionally runs against the disposable PostgreSQL 17 runtime for pool sizes 2 and 4. Each pool profile compares async output with both SQLite and the synchronous PostgreSQL bridge, sends ten concurrent read requests, verifies a 35-table snapshot and queue allocator are unchanged, blocks session resolver access, and drains the pool with zero waiters. PostgreSQL default_transaction_read_only=on rejects an attempted mutation. This real-PG check is part of the dedicated two-test gate; it does not alter the 488 baseline authority.

## Product behavior and remaining boundary

Existing routes still use the synchronous Store by default. The async path is opt-in through `buildApp` and is limited to the public mission catalogue. No business rules or persisted data changed. A future slice may choose another chain only after the same no-side-effect review; this branch does not begin that work.
