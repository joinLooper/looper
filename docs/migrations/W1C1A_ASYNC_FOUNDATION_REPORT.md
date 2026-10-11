# W1C1-A Async Persistence Foundation Report

## Authority and scope

- Source branch: `codex/app-w1b-postgres-parity`
- Source HEAD: `0cb4dd105c2b5c9722b70af00c192e1be816ea81`
- Implementation branch: `codex/app-w1c1-async-foundation`
- The existing SQLite persistence layer, synchronous W1B PostgreSQL adapter, Store, routes, Gameplay, Economy, Forest, Treehouse, and database migrations remain authoritative and unchanged.
- No Supabase resource, production database, dual-write path, native app, or W1C1-B work was started.

## Foundation delivered

`apps/api/src/persistence/async-contract.ts` defines the independent `AsyncDatabase` and `AsyncTransaction` contracts. The contract returns promises and typed errors for pool acquire timeout, statement timeout, request cancellation, invalid transaction scope, and unknown commit outcome.

`apps/api/src/persistence/async-postgres.ts` implements the bounded PostgreSQL primitive without wiring it into `PersistenceDatabase` or any route. It provides:

- Configurable `pg.Pool` with a bounded maximum of 1–32 connections, idle lifecycle, acquire timeout, and pool error diagnostics.
- One pinned client per transaction: `BEGIN`, W1B advisory writer lock `pg_advisory_xact_lock(170027,1)`, callback, and `COMMIT`/`ROLLBACK`.
- Transaction-scoped statement and lock timeouts.
- Nested savepoints with validated and quoted identifiers, rollback-to-savepoint, and release.
- AbortSignal query cancellation using PostgreSQL's cancel packet and a short-lived cancel socket; transaction cancellation propagates from the transaction options.
- `OUTCOME_UNKNOWN` handling around commit acknowledgement; no automatic retry.
- Queue allocation through the existing `w1b_control.queue_counters.high_water` authority, never a PG sequence.
- Health reporting and graceful pool drain.

The root package has one additional command, `test:async-foundation`; it is a separate primitive test suite and does not replace or duplicate the existing API/frontend/PostgreSQL test commands.

## Test evidence

The isolated real PostgreSQL 17 suite uses the local W1B runtime and a disposable `w1b_async_foundation` schema. It has 15 checks and completed 15/15:

- pool saturation and acquire timeout;
- statement timeout and request cancellation for a running query;
- advisory writer-lock waiting;
- transaction-level cancellation;
- savepoint rollback and transaction context leakage;
- rollback-safe queue high-water allocation;
- unknown commit outcome;
- backend termination recovery, in-flight shutdown, and reconnection.

The unchanged W1B oracle also completed API 315/315, frontend 129/129, PostgreSQL 44/44, total 488/488. Existing runtime QA and Windows browser capture completed without console errors.

## Persistence and migration boundary

Default application persistence is still SQLite through the existing synchronous Store contract. The new adapter is an isolated foundation only. No Store method, route handler, reward/ledger operation, idempotency path, migration file, or business rule was changed. The disposable test schema is created by the test harness and is not a production migration.

## Known limitations and review points

- The foundation is not a full Store async migration and is not connected to API request handlers.
- Commit acknowledgement loss is surfaced as `OUTCOME_UNKNOWN`; callers must reconcile before any future retry policy is designed.
- Pool sizing and timeout values used by tests are evidence parameters, not production capacity settings.
- Local Windows frozen install is subject to the workstation's pnpm ignored-build policy for Puppeteer; hosted CI remains the authority for clean Linux installation.
- Supabase region, cost, project, schema, Auth, and production migration remain on HOLD.

## Status

Local implementation, regression gates, and Hosted CI pass. Hosted CI evidence is recorded in `W1C1A_HOSTED_CI_RESULTS.json`; the independent Draft PR remains unmerged.
