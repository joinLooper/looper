# W1C1-D Call Graph and Transaction Boundaries

Source: `6333b4c27a19bea0493c9d5327aedb160d0ddb72`; branch `codex/w1c1-d-legacy-atomicity`. The complete source-line inventory and transitive `this.method` callers are in `evidence/W1C1D_CALL_GRAPH.json`. Line references below refer to that immutable source, not shifted final lines.

## Actual boundary

`requirePlayerSession -> resolvePlayerSession -> getPlayerSessionContext -> getUser -> applyEnergyRegeneration -> mapUser/getResources/getGrowth/history`.

Before: session touch and each regeneration write independently commit without an outer transaction. After: session validation/time/expiry check, optional touch, regeneration and full snapshot are enclosed in one root SAVEPOINT. `getUser` has its own SAVEPOINT so standalone readers and calls from existing business transactions are protected. The inner SAVEPOINT releases into its caller without committing the outer transaction. `applyEnergyRegeneration` has exactly one caller (`getUser`) and remains unchanged, including the shared W1C1-C Pure Helper.

## Direct and indirect callers

| Source caller | Ownership at state read | Result of correction |
| --- | --- | --- |
| getPlayerSessionContext (1683) | Previously none; now session SAVEPOINT | Session + Energy + histories + snapshot commit together |
| listUsers (684) -> overview (3249) | Per-user operation, no aggregate transaction | Each getUser is atomic; the whole list is not a new batch transaction |
| createPlayerSession (1612) | getPlayerSessionContext(false) follows existing COMMIT (1670) | State read is atomic; login transaction remains separate |
| logoutPlayerSessionToken (1742) | getPlayerSessionContext(false) precedes existing BEGIN | State read is atomic; revocation transaction remains separate |
| createPlayerProfile (1884) | Both getUser branches follow COMMIT | Atomic state read; profile creation is not reorganized |
| getTaskCodeSubmissionForUser (2309) | Standalone getUser on settled result | Only player state write group is wrapped |
| acceptMission (2800) | getUser before enrollment write | No new mission/enrollment transaction scope |
| redeem (2811) -> redeemInTransaction (3374) -> applyRewardEvent (3454) / getUser | Existing BEGIN IMMEDIATE; includes replay branches | Inner SAVEPOINT retains reward/settlement caller's commit/rollback ownership |
| decideTaskCodeSubmission (2393) -> settleConfirmedTaskCodeSubmission (2474) -> redeemInTransaction | Existing decision transaction | Same outer ownership; failure propagates to existing rollback |
| decideTaskCodeSubmission -> rebuildTaskCodeSettlement (2524) -> rebuildSettlement (3863) | Existing decision/replay transaction | Same outer ownership |
| settleActivityReward (2824) -> applyRewardEvent | Existing transaction before COMMIT | Same outer ownership |
| settleActivityReward -> rebuildSettlementFromRewardEvent (3878) | Replay branch follows COMMIT (2850); other callers can still own a transaction | Works in both root and nested contexts |
| knowledgeAnswerResult (2865) / getKnowledgeCardState (2897) | Can be standalone or reached inside answerKnowledgeCard | SAVEPOINT handles either context |
| answerKnowledgeCard (3128) | Initial getUser before BEGIN; reward/snapshot later inside BEGIN | Does not merge previously separate operations |
| claimResidentMission (2986) -> applyRewardEvent / getUser | Existing claim transaction through COMMIT (3081) | Does not commit claim early; rollback remains caller-owned |
| rebuildSettlement / rebuildSettlementFromRewardEvent | Inherit their caller's context | No independent BEGIN introduced |
| app.ts mission-accept response; qa-unified-runtime-server.ts | Direct getUser | Standalone atomic state read |

The inventory also lists all affected HTTP route entrypoints, including authenticated routes that call requirePlayerSession before their separate business operation. This change makes that authentication/state operation atomic; it does not make every entire endpoint one new transaction.

## SQLite and synchronous PostgreSQL mechanics

- SQLite: an outermost SAVEPOINT starts a transaction; RELEASE commits only that root. Nested RELEASE leaves the enclosing BEGIN/SAVEPOINT open. ROLLBACK TO restores the inner boundary; RELEASE removes it.
- Existing synchronous PG worker: a root SAVEPOINT is translated to BEGIN + the existing transaction-scoped advisory writer lock + SAVEPOINT. It tracks root ownership and commits when that root is released. An already-active transaction only receives a nested SAVEPOINT. Its existing statement savepoints remain unchanged.
- Store savepoint names have a process-wide monotonic sequence, distinct from `w1b_statement` and caller names. No UUID/random or clock reads are introduced. Same-class Store instances cannot collide through per-instance numbering.
- All work is synchronous on the same database handle/pinned worker connection. No awaited work, second connection or cross-database authority is introduced.
- Callback error: ROLLBACK TO, then RELEASE, then propagate the original error. If rollback cannot be confirmed, close the handle and propagate both errors; never release after a failed rollback.
- SAVEPOINT acquisition error: close the handle because PG may have opened its root transaction before writer-lock acquisition failed. RELEASE error: close the handle and report `PLAYER_STATE_OUTCOME_UNKNOWN`; never infer rollback or automatically retry a potentially committed operation.
- Existing callers remain responsible for their outer rollback and connection recovery after a terminal database failure. No durable retry receipt, historical repair or migration is added.

## Evidence

Before implementation, both engines passed direct SAVEPOINT compatibility probes: nested BEGIN/SAVEPOINT, inner RELEASE, outer rollback and ability to start a new transaction. New tests use full database snapshots for rollback, actual uniqueness errors, both outer owner types with commit/rollback/caught-inner-failure, standalone getUser, unauthorized sessions, and actual reward and merchant decision APIs. Full baseline and async suites remain separate gates.
