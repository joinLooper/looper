# W1C1-C Player State Call Graph

Authority: `aaa9c74dabf8265f21a60dd0d1e15cb5aa96196a`, branch `codex/w1c1-b-async-readonly`.
The initial non-atomic stop gate below was reviewed and approved by central on 2026-10-13; pure helper extraction was approved on 2026-10-14. The source inventory below is retained as the legacy before-state, not the current implementation status.

## Implemented async chain (2026-10-14)

`buildApp(store, { asyncPlayerStateRepository })` first compares the sync Store and async database's PostgreSQL database/schema/address/port. It rejects implicit/default SQLite or mismatched authorities before enabling the opt-in. The caller owns/drains the injected bounded pool (recommended max=2, tested configurable max=4).

`GET /player/state` alone parses the existing configured player cookie and connects HTTP disconnect to AbortSignal. The default branch remains `requirePlayerSession(request).profile`. No login/logout/other player/auth route changed.

`AsyncPlayerStateRepository.getPlayerState` validates token shape, hashes it, then uses `AsyncDatabase.withTransaction` → pinned connection → advisory writer lock `(170027,1)` → fresh session join/status/purpose/revocation/expiry validation **after** waiting → session touch → resource/settings reads → shared `calculateEnergyRegeneration` → resource update → original grant ledger → natural_regen log → resource.energy_regenerated audit → full UserProgress snapshot → COMMIT.

Every database operation in the request uses the callback's transaction object; no per-query pool checkout or sync Store SQL is used. A tiny immutable configuration row view reuses the existing Store's settings/level getters and validation on already-loaded rows. It rejects writes and unsupported reads and owns no database connection. DTO mapping uses the existing `nextLevelExp`, `buildRewardSummary`, and safe integer codec; three-engine snapshots test all persisted rows and DTO/history fields.

The shared pure helper is also called by the original synchronous Store; only its inline arithmetic was replaced. Existing Date.now/nowIso calls, IDs, SQL ordering and legacy failure boundary remain. Pre-commit errors roll the new path back in full, including session touch. Unknown COMMIT errors return an operation ID and UNKNOWN, discard uncertain connections and never retry. `W1C1C_APPROVED_FAILURE_DELTA.md` defines the approved difference and reconciliation limitations.

## Legacy inventory and initial decision record

## Current behavior → side effect → boundary → proposed equivalent → test

Line references below refer to the source authority, whose product files are unchanged.

| File / call | Current behavior and side effect | Current transaction boundary | Async equivalent, pending approval | Parity evidence / required test |
| --- | --- | --- | --- | --- |
| `apps/api/src/app.ts:15`, cookieValue | Read configured player cookie; malformed/missing cookie cannot identify a player | None | Keep cookie parsing and cookie name contract; no token in logs | Missing/invalid cookie, custom cookie name; pending |
| `app.ts:161`, requirePlayerSession; `app.ts:269`, GET /player/state | Resolve context then return `.profile`; null context becomes 401 `player Session is required` | No route transaction | Only this route gets opt-in async repository; other auth/player routes stay synchronous | Response shape, errors, default SQLite and route isolation; pending |
| `store.ts:291`, hashOpaqueToken | SHA-256 of opaque token; no raw token stored | Pure computation | Reuse/extract exactly the same pure helper | Hash, malformed token and no token leakage tests; pending |
| `store.ts:1682`, getPlayerSessionContext | Regex check; join account_sessions/accounts/users by token_hash and purpose=player; active, expiry and revoked checks | SELECT before any write; no request lock | Validate under transaction-scoped connection and writer lock; recheck expiry after waiting | Eight session-security cases pending; valid synthetic LINE identity used in diagnostic |
| `store.ts:1693`, session touch | Updates last_used_at and updated_at for valid session | Independently committed before getUser | Proposed shared transaction would roll back touch when later regeneration fails | **Reproduced: touch survives all four injected failures** |
| `store.ts:1979`, getUser | Regenerate first; read users; missing user => 404; map snapshot | No outer BEGIN/COMMIT | Await regeneration and snapshot on same transaction context | Missing resources/growth, snapshot parity; pending |
| `store.ts:3768`, applyEnergyRegeneration | Read resources and stored economy settings; calculate ticks and capped recovered Energy | Read/compute outside write transaction | Extract pure calculation for both sync and async callers only after boundary decision | All interval/cap cases required; only exact interval exercised here |
| `store.ts:3785`, already-full branch | Advances regen timestamp, configured interval and updated_at; no ledger/log/audit | Single independent update | Same branch and calculations; transaction choice needs approval | Full cap, invalid timestamp, max=0 cases pending; initial diagnostic fixture exposed Lv1 max=0 |
| `store.ts:3790`, recovering branch | UPDATE resources, then create regeneration source ID | Resource update commits before ledger | Same formulas, same source type daily_login, same metadata; shared transaction would change failure outcome | **Reproduced: energy=1 and advanced timestamp survive failure before ledger** |
| `store.ts:3945`, recordTransaction | Append resource_transactions with grant, balances, amount, generated source/idempotency ID, ticks metadata | Separate INSERT | Await insert on pinned transaction; no random new retry after unknown commit | **Reproduced: ledger survives failure before energy log** |
| `store.ts:3980`, recordEnergyLog | Append natural_regen energy_logs; same source ID and overflow | Separate INSERT | Await insert on pinned transaction | **Reproduced: ledger and energy log survive failure before audit** |
| `store.ts:4056`, audit | Append resource.energy_regenerated with recovered amount and wall-clock timestamp | Separate INSERT | Await insert before commit; keep existing action/entity semantics | **Reproduced: missing audit remains missing after repeat read** |
| `store.ts:4338`, mapUser | Resources, growth, enrollments, latest reward mapped into UserProgress | Multiple reads, not one DB snapshot | Await reads on same connection; retain all fields and ordering | Stars/EXP/Level/CO₂e/Growth/history cross-engine parity pending |
| `store.ts:3910`, getResources; `store.ts:3931`, getGrowth | Stored resources/growth; nextLevelExp from existing level definitions; interval from settings | Read-only helpers | Reuse pure mapping/nextLevelExp; await data access | No business formula rewrite; pending |
| `store.ts`, mapEnrollment/mapRewardEvent | Pure row/JSON mapping for existing history | No writes | Share mapping without changing defaults or serialization | History and optional fields parity pending |
| `app.ts:742`, error handler | Preserve status/message mapping (including locked DB and constraints) | Does not undo already committed writes | Define persistence cancellation/timeout/unknown-outcome errors without exposing secrets | Error contract and unknown-commit behavior pending |
| `persistence/postgres-worker.mjs`, execute | Each write outside explicit Store transaction gets its own BEGIN/advisory lock/COMMIT | **Statement-level**, not whole route; preceding read/calculation not covered | Existing AsyncDatabase.withTransaction holds writer lock for callback | SQLite and sync PG partial-commit results match in all 5 scenarios |
| `persistence/async-postgres.ts:308`, withTransaction | Bounded pool, pinned connection, advisory lock (170027,1), rollback before commit, UnknownCommitOutcomeError | Whole callback | Available but **not wired to player state** | Approved foundation authority retained; no new path claim |

## Existing calculations and clock authority

Regeneration returns without mutation for missing resources, maxEnergy<=0, interval<=0, invalid last timestamp, non-positive elapsed time, or zero ticks. Otherwise elapsedSeconds=floor((Date.now()-lastUpdated)/1000), ticks=floor(elapsedSeconds/interval), nextLast=lastUpdated+ticks*interval*1000. Recovery is min(ticks,maxEnergy-currentEnergy). At cap, only timestamp/interval fields advance. Existing Store.currentTime controls session timestamps; regeneration uses Date.now(), and createdAt/audit use nowIso(). Do not silently unify these clocks in an async extraction.

New Lv1 accounts have maxEnergy=0; Lv3 unlocks maxEnergy=120. The diagnostic uses the existing reward fixture to reach Lv3, then sets synthetic depleted Energy and an exact one-interval clock. This changes isolated test data only.

## Required central transaction decision

The work package requires a transaction covering session validation/touch, regeneration, resource/log/audit and snapshot, while also requiring escalation for an existing non-atomic boundary. Those requirements cannot be presented as exact failure-state parity here.

Recommended decision: authorize a narrowly scoped atomic failure-semantics change for the opt-in async GET /player/state path. One pinned writer transaction validates the session, touches it, computes from locked fresh resources, writes all records and reads the snapshot. Any pre-commit failure rolls all those writes back. Default synchronous SQLite is unchanged unless separately authorized. Successful-response/formula parity remains exact; failure-state differences must be named and approved.

Alternative: leave session touch outside and make only regeneration atomic. This still changes regeneration failure semantics and does not meet the stated same-transaction requirement. Preserving every current partial commit would preserve the defect and cannot satisfy atomicity/concurrent-ledger safety. Neither alternative is implemented.

Cross-process lost-update/duplicate-regeneration races are a **risk inferred from the read-before-statement-lock structure**, not reproduced in this diagnostic. No concurrent performance or safety PASS is claimed.
