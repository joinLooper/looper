# W1C1-C Resume Preflight — 2026-10-13

**W1C1-C PARTIAL — CENTRAL DECISION REQUIRED**

The original atomicity stop gate is **reviewed and approved**. It is not being requested again. `W1C1C_APPROVED_FAILURE_DELTA.md` records the authorized atomic transaction, rollback-all including session touch, unknown-commit reconciliation design, pre-beta SQLite consistency blocker, and future provider/role decisions.

Resume source: `a66e99099ee5377f0c400c8d933ea943d5e279cf`, branch `codex/w1c1-c-player-state-async`. HEAD and initially clean working tree verified. Existing diagnostic commit, source reports and previous ZIP are retained. No product file changes have been made in this resume preflight.

## One implementation constraint awaiting clarification

The original package requires reusing or safely extracting the approved pure Energy calculation and forbids a second Energy business-rule implementation. The resume decision also says **「本批不得修改原同步 SQLite Store」**. The calculation is currently inline in `store.ts::applyEnergyRegeneration`, not an exported reusable pure function.

Requested narrow clarification: allow extracting only that arithmetic into one shared pure helper and replacing the inline calculation with a call to it. Both paths would use the same formula; the synchronous path's transaction boundary, write order and partial-commit failure behavior would remain unchanged. This necessarily edits `store.ts` structurally, so it has not been performed while the literal no-edit instruction remains unresolved. If no Store edits are permitted, agree on a different reuse mechanism before implementation; do not duplicate the rules or use runtime source evaluation/private-method hacks.

No AsyncPlayerStateRepository or new route wiring exists yet. There are no new Player State acceptance tests, no new Draft PR and no push or Hosted CI run for this resume. Existing PRs are untouched. All remaining slice gates still need implementation and final-head verification after the clarification.

## Actual local validation while waiting

| Gate | Result | Scope |
| --- | --- | --- |
| Frozen install | PASS, corepack pnpm 10.13.1 | Existing locked dependencies |
| lint | PASS | Unchanged product baseline |
| typecheck | PASS | Unchanged product baseline |
| build | PASS | Unchanged product baseline |
| API | 315/315 | Existing tests |
| Frontend | 129/129 | Existing tests |
| PostgreSQL | 44/44 | Real isolated PG17 |
| Baseline | 488/488 | Existing tests, not new slice acceptance |
| Async Foundation | 15/15 | Existing foundation |
| MVP Load Matrix | 48 scenarios, zero failures | Existing infrastructure |
| Async Mission | 4/4 actual command count | 2 original tests plus 2 PG pool=2/4 parity tests; no assertions removed |
| Browser capture | PASS | Existing assembly / Unified Runtime |
| New Player State / Hosted CI | NOT RUN | New implementation awaits pure-rule extraction clarification |

The first install attempt used the host's global pnpm 11.25.0 and failed its ignored-build policy. Its raw log is retained. Corepack resolved the repo-pinned pnpm 10.13.1; a noninteractive frozen install then completed. The global version's automatically inserted workspace placeholder was removed, and the workspace configuration remains unchanged. Ignored dependency build-script warnings are preserved in the successful install log; no dependency build policy was relaxed.

Existing W1B tests generate some tracked evidence files. This run's outputs are retained under `output/w1c1c/resume-w1b-results/`, while the historical committed versions were restored. Foundation/load/read-only outputs were directed to new ignored directories. No original diagnostic logs or results were discarded. No cookie assertion was changed; this run passed without a cookie retry and does not prove that the known timing issue is fixed.

All verification here used the unchanged product at resume source HEAD. These results must not be presented as verification of an unimplemented async route. Final deliverable HEAD and cleanup status are recorded in the checkpoint ZIP's version manifest.

## Next step after clarification

Proceed with the authorized opt-in GET /player/state transaction, successful three-engine parity, rollback exception tests, request cancellation/timeout/unknown-outcome tests, session isolation, pool=2/4 and 1/5/10/20 concurrency, final regression, normal push and an independent Draft PR with Hosted Linux CI. No new atomicity approval is needed; only the shared pure-rule extraction's permitted edit boundary remains open.
