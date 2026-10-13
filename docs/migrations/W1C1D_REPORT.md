# W1C1-D Legacy Session & Energy Atomicity Closure

**W1C1-D PASS — READY FOR CENTRAL REVIEW**

## Source / Final / PR

- Source: 6333b4c27a19bea0493c9d5327aedb160d0ddb72, codex/w1c1-c-player-state-async / PR #48.
- Work branch: codex/w1c1-d-legacy-atomicity.
- Independent Draft PR: https://github.com/joinLooper/looper/pull/49; base codex/w1c1-c-player-state-async. No PR merged or history rewritten.
- Hosted implementation SHA: 592d0c1311a162c5eaf8f7b7bb3f1f87848dac32.
- Final documentation HEAD and its own Hosted CI: DELIVERY_VERSION.json in the ZIP. This avoids a commit containing its own SHA.

## What changed

The synchronous Store now encloses getPlayerSessionContext in a SAVEPOINT and also protects standalone getUser. Session validation/touch, Energy update/timestamp, resource ledger, Energy Log, Audit and the complete snapshot share an atomic operation. SQLite root RELEASE commits; nested RELEASE only returns ownership to the caller. The existing synchronous PG worker already implements root/nested SAVEPOINT and its advisory writer lock; it was not modified.

No incompatible nested BEGIN is added. Errors before release roll back to the scope and rethrow; unconfirmed control/rollback errors close the handle. An uncertain root RELEASE is not called a confirmed rollback and is never automatically retried. Existing callers own their outer business commit/rollback and terminal-connection recovery. No historical records are repaired.

The only product file changed is store.ts. applyEnergyRegeneration and the canonical Energy pure helper are unchanged. The approved Async repository, adapter and app route remain unchanged. No new formula, SQL data mutation, UUID generation, clock read or rounding is introduced. The existing eight complete success snapshot hashes continue passing unchanged.

## Approved failure delta

The original ten legacy scenarios were rerun before editing and preserved verbatim. After correction, every injected pre-commit failure restores Session, resources and all histories. Success and confirmed-rollback retry each produce one complete regeneration group. The old partial commits are not treated as acceptable parity. See W1C1D_SYNC_ATOMICITY_DIFF.md and W1C1D_SYNC_FAILURE_EVIDENCE.json.

The new 14 tests contain 26 failure checks, 12 nested ownership cases (BEGIN and SAVEPOINT × commit, rollback, caught inner failure × two engines), 16 Session/touch cases, eight actual reward/merchant settlement cases, and two full successful SQLite/PG parity snapshots with repeated reads. They verify no leaked open transaction by opening and rolling back a fresh transaction after every scenario.

Fixture-development failures are preserved in legacy-first.log: wrong-purpose sessions initially omitted the required invitation reference; synthetic native errors retain existing engine-specific status mapping; merchant settlement legitimately refills to cap, so it advances the regeneration timestamp without a natural-regen ledger. Fixtures and expectations were corrected to the existing authority; no product rule was changed to satisfy them.

## Validation

| Gate | Result |
| --- | --- |
| Frozen install | PASS |
| Lint / typecheck / build | PASS, forced without local task cache |
| API / Frontend / PG | 315 / 129 / 44 PASS |
| Baseline | 488/488 |
| Async Foundation | 15/15 |
| MVP Load | 48/48 scenarios |
| Async Missions | 4/4 |
| Async Player State | 13/13; implementation unchanged |
| Energy Extraction | 2/2; unchanged success oracle, approved new failure expectations |
| New Legacy Atomicity | 14/14 |
| Browser assembly / Unified Runtime capture | PASS |
| Local PostgreSQL cleanup | server stopped |
| Hosted Linux CI | success — https://github.com/joinLooper/looper/actions/runs/38481504196 |
| Backend CI | success — https://github.com/joinLooper/looper/actions/runs/38481504324 |

The known cookie timing boundary is corrected in a separate test-only commit: the assertion accepts exactly 604800 seconds as well as the previous 6047xx range, with a delimiter check. Authentication code, TTL and session expiration are unchanged. Historical failure/rerun evidence is retained; this addresses that assertion defect, not a claim that all future CI flakes are impossible.

## Changed files and evidence

- store.ts: two narrowly scoped wrappers and their SAVEPOINT/error helper.
- app.test.ts: independently committed cookie-boundary assertion only.
- test-w1c1d-legacy-atomicity.mjs: 14 additional tests; full table snapshots and actual Store call chains.
- w1c1c-transaction-boundary.spec.mjs: original ten cases now enforce the approved atomic correction; raw unique SAVEPOINT names are preserved while parity compares their nesting structure.
- package.json / CI workflow: independently counted legacy atomicity command and uploaded evidence.
- W1C1D documents / JSON: source call graph, immutable before evidence, approved delta, results and Hosted evidence.

## Remaining risks and stop boundary

The prior PRE-BETA Session/Energy partial-commit blocker is resolved for these tested SQLite and synchronous PG paths. Previously committed incomplete historical records are not repaired. Other legacy business operations that have independent transaction scopes are not declared globally atomic by this change. In particular, login/profile creation commits and logout/enrollment operations retain their existing boundaries; only their state-read operation is newly atomic.

The synchronous PG bridge remains an isolated parity bridge and is not promoted to production. Mixed sync/async writer blocking and complete App persistence migration remain separate work. Unconfirmed database-control outcomes require connection recovery and investigation rather than automatic replay. No Supabase, Native App, provider login/linking, Gameplay/Economy or character/Forest/Treehouse work was started.

Delivery includes START_HERE.html, reports, full before/after and test logs, browser evidence, changed-source patch, manifest and SHA-256 verification. Stop at central review.
