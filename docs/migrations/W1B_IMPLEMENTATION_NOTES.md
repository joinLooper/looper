# W1B persistence implementation notes

This is an isolated PostgreSQL 17 parity implementation. The product entry point still opens SQLite by default. No production database is connected or migrated.

## Shared authority

`InMemoryStore` accepts the minimal `PersistenceDatabase` contract through its existing options object. Its 26 transaction-bearing business method bodies are unchanged from W1A HEAD `06b64d1906074b8a9b84ded1b6d2818b88d80189`; `scripts/inspect-w1b-authority.mjs` verifies the bodies and records a per-method trace. Economy, settlement, progression, growth, Knowledge, Resident missions, Task Code and reporting calculations remain in their original shared modules.

SQLite uses the existing `node:sqlite` connection and migrations through this structural contract. PostgreSQL uses pinned `pg@8.16.3` on a dedicated worker/connection. A bounded synchronous RPC bridge preserves the Store's current synchronous interface. This keeps engine differences in persistence and avoids a second implementation of business logic. The bridge intentionally blocks its caller while querying; it is suitable for this isolated compatibility phase, and is not a production throughput or deployment decision. Concurrent tests create separate application workers and PG connections and observe both waiting on the same advisory lock.

## Transactions and errors

Every `BEGIN IMMEDIATE` maps to `BEGIN` plus `pg_advisory_xact_lock(170027,1)` on that connection. Standalone writes use an implicit transaction with the same lock. Existing nontransactional multi-statement paths retain their original boundaries. Statements inside a transaction use savepoints so a PostgreSQL statement error does not poison the outer transaction, matching SQLite ABORT semantics. `INSERT OR IGNORE` suppresses only UNIQUE / NOT NULL / CHECK violations; FK and trigger errors still fail. The traceability artifact records all eleven original call sites, including the historical SQLite-only backfills that PG v27 bootstrap does not replay.

The worker has a finite connection/query/RPC timeout. An unknown transaction outcome is surfaced as an error; it is never retried automatically. Existing idempotency keys remain the authority for reconciliation and retry. Idle driver errors are retained and surfaced on the next RPC; worker faults are terminal. A real backend-termination test confirms that an open transaction rolls back and no automatic retry/reward occurs.

## Schema and representation

`W1B_POSTGRES_SCHEMA.sql` is generated from the approved W1A inventory, with 35 application tables, 332 columns, 55 FK, 112 CHECK predicates and twelve equivalent protection triggers. The 17 JSON and 61 timestamp columns remain TEXT. Existing nullable SQLite TEXT primary keys become nullable UNIQUE keys, retaining SQLite NULL behavior; they are not silently strengthened to PostgreSQL NOT NULL primary keys. PostgreSQL additionally creates physical indexes for INTEGER primary keys that SQLite implements as rowid aliases; source explicit/partial indexes and logical uniqueness are preserved.

The separate `w1b_control.queue_counters` table is engine metadata, not a new product table. Queue defaults update its high-water row transactionally. Explicit queue orders also advance the high-water mark; rollback restores it, and deleting the highest queue row does not reuse a committed allocation. No PostgreSQL sequence is used as queue authority.

The per-client BIGINT/numeric integer codec returns existing API numbers only within the safe integer range. It fails on overflow and does not change pg's global type parsers. SQL compatibility covers the shared Store's actual syntax: placeholders, nullable `IS` comparison, SQLite's `user` alias, NULL sort order, ASCII lower/LIKE, source GLOB predicates, JSON extraction/comparison/set semantics and statement failures. It is not a general SQLite emulator. The JSON helpers explicitly support the flat `$.key` paths used by the approved source; unsupported paths fail rather than silently changing data. Raw TEXT columns are never normalized on import, read or write. The intentionally mutating `json_set` helper follows SQLite's output behavior when invoked.

## Bootstrap and fixtures

Connecting does not create schemas or users. Explicit `bootstrapPostgres` applies the source-controlled schema and calls shared `seedConfiguration` for economy, level, merchant plan and disabled recipe definitions. The original SQLite `seedDatabase` still calls the same configuration seed and then its existing demo/backfill steps, preserving default behavior. Only the explicit test harness calls that demo fixture function for PG. Fresh PG bootstrap is tested to contain zero accounts/users/identities/sessions.

Tests freeze both the Store-injected clock and global Date, and replay deterministic UUID/token entropy. Each scenario is executed once against SQLite and once against real PG17 using the same business code. API/Store results and every row in all 35 tables are compared. Only JSON wire serialization and relational row ordering are normalized; economic values, IDs, timestamps, JSON strings, snapshots and links are compared exactly. Failure cases compare all rows before/after rollback, then compare successful retries including queue order.

## Reproduction

On Windows, run the R0 bootstrap/start helpers in the PowerShell environment described by `scripts/W1B_POSTGRES_RUNTIME_README.md`. The test gate requires an already-running isolated runtime; it does not change execution policy or install a runtime automatically.

```powershell
./scripts/w1b-pg-start.ps1
./scripts/w1b-pnpm.ps1 install --frozen-lockfile
./scripts/w1b-pnpm.ps1 test
./scripts/w1b-pnpm.ps1 lint
./scripts/w1b-pnpm.ps1 typecheck
./scripts/w1b-pnpm.ps1 build
./scripts/w1b-pg-stop.ps1
```

The wrapper resolves pnpm 10.13.1 into a project-local Corepack cache and supplies a temporary process PATH shim so nested `pnpm` commands use the same version. It restores environment values on exit and does not alter global pnpm. Root `pnpm test` runs existing API tests, existing frontend tests, then PostgreSQL parity tests. API lint/typecheck also checks the new parity test sources through `tsconfig.parity.json`, using the same TypeScript toolchain. `test:api` remains the SQLite/API responsibility; `test:frontend` retains the W0 frontend suite; `test:postgres` has no emulator/skip fallback.

The existing GitHub Linux CI job gains only isolated runtime start/stop steps. It uses the official `library/postgres` 17.11-bookworm image pinned to digest `sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826`, verified against the Docker Hub tag metadata on 2026-10-07. Host networking plus explicit PostgreSQL `listen_addresses=127.0.0.1` and port 55432 keeps the real server endpoint loopback-only. Fresh random CI passwords remain in ignored runtime files. The helper refuses non-GitHub/Linux invocation and refuses to stop a container without this checkout's ownership label. No Docker/Podman/WSL was installed on the Windows development host. The hosted CI execution itself is not claimed as locally verified.

## Boundaries retained

No Supabase project/Auth/Data API/RLS/Storage work; no anon/authenticated grants; no real-user data import; no Native App, UI, Forest, Treehouse or Gameplay change; no new Stars spending rule. The sync PG bridge, cold-start I/O characteristics of the OneDrive-backed runtime, and eventual production deployment architecture remain explicit review considerations. W1C is not started.
