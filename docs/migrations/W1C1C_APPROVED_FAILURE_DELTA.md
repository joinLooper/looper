# W1C1-C Approved Failure Delta

Central decision received 2026-10-13 (Asia/Taipei), resuming from `a66e99099ee5377f0c400c8d933ea943d5e279cf`.

Pure Energy helper extraction approved 2026-10-14, resuming from `66b3beffd2ab4de94a056264f9d3c78bbbfbf781`. The shared `calculateEnergyRegeneration` contains only arithmetic and timestamp calculation. Legacy Store keeps its clock reads, SQL sequence, IDs and partial-commit boundary. Deterministic before/after evidence covers eight complete successful database/response/SQL snapshots and ten SQLite/sync-PG failure cases.

The central approval authorizes **only opt-in async GET /player/state** to use one PostgreSQL transaction and the existing transaction-scoped advisory writer lock. Session validation/revalidation, session touch, regeneration, resource update, resource transaction, energy log, audit and response snapshot must use the same pinned connection.

| Situation | Legacy synchronous authority | Approved async behavior |
| --- | --- | --- |
| Valid successful read | Existing DTO, Energy formula/interval, resource/history values and normal ledger/audit | Same successful contract |
| Failure before resource update | Session touch remains committed | Roll back session touch as well |
| Failure before ledger insert | Session and resource changes remain; missing ledger | Roll back all changes |
| Failure before energy log | Session/resource/ledger remain; missing log | Roll back all changes |
| Failure before regeneration audit | Session/resource/ledger/log remain; missing audit | Roll back all changes |
| Failure while mapping snapshot, before COMMIT | Prior independent writes may remain | Roll back all changes |
| Abort/timeout before commit, rollback confirmed | No async equivalent in legacy contract | No partial success retained |
| COMMIT acknowledgement missing | Outcome cannot be inferred from transport error | OUTCOME_UNKNOWN; never assert rollback, never blindly retry |

Failure behavior is intentionally different. The previous diagnostic is evidence of a defect, not an invariant to reproduce in the async path. Formula, successful response and ordinary ledger semantics remain authority.

## PRE-BETA DATA CONSISTENCY BLOCKER

Legacy synchronous SQLite GET /player/state still permits the documented partial commits. Before a formal beta, separately fix that path or prove that no real-player path can reach it. This batch does not repair historical records. Leaving SQLite as the default during isolated development does not clear this blocker.

## Unknown-commit reconciliation design

An uncertain async response includes a non-secret operation ID. Where Energy is regenerated, it is the existing energy-regen source ID / idempotency key, generated at the original source-ID step before COMMIT (preserving successful ID ordering). Locate resource_transactions by that key and match energy_logs.source_id plus audit_events.entity_id and recovered amount. An operator-controlled read against the same authority should obtain the writer lock after the original attempt ends, then check the complete set and compare the persisted resource timestamp/balance. Do not run a new regeneration request as the reconciliation query. Session-only unknown outcomes return an error correlation ID with no claim of a durable database receipt.

A complete matching set proves the regeneration committed, even if later state changes mean the current balance differs. A partial set is a consistency incident; freeze automated recovery and escalate. Absence alone is not proof of rollback until the original transaction outcome is resolved. Session-only / full-cap updates have no existing operation record: their unknown result remains indeterminate, and mutable timestamps alone do not prove which attempt committed. A durable request receipt/journal covering every outcome would require separately reviewed schema/orchestration work; this slice must not claim exactly-once replay without it. No automatic non-idempotent retries are authorized.

The new route returns HTTP 503, code `COMMIT_OUTCOME_UNKNOWN`, outcome `OUTCOME_UNKNOWN`, and `operationId` for this case. It never retries internally. A fault test loses the acknowledgement after a real COMMIT and reads back all three matching records. Another fault test fails the COMMIT transport before acknowledgement; both remain UNKNOWN publicly. The adapter now discards uncertain COMMIT/ROLLBACK connections so an open transaction cannot leak to the next borrower. Closing a socket is not evidence that the original COMMIT did not happen.

HTTP disconnect and explicit AbortSignal tests also exposed a cancellation window during the two timeout SET queries. Rechecking the signal after those SETs prevents starting the application statement after cancellation. Both minimal adapter repairs are backed by retained pre-fix failure logs; neither changes business rules.

## Future authentication compatibility (record only)

Players: LINE primary. Merchant owners/managers: Google primary. Staff: mobile LINE preferred. Merchants use a responsive web back office, without a separate native app. Multiple providers may bind to one Looper Account; authorization is by role/scope/capability. Never auto-merge accounts by email. This batch implements none of Google/Apple login, provider binding, logout or auth migration.
