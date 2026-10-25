# LOOPER｜Knowledge Book R2＋R3｜獨立 Codex 工作線 B

> Status: CODEX_IMPLEMENTED / REAL_EXPO_WEB_QA_PASS / TEST_ONLY. Source art remains blocked; iPhone NOT RUN.

## Authority and handoff

- Canonical task: [Issue #67](https://github.com/joinLooper/looper/issues/67).
- Initial B base: `codex/f1-my-forest-info-handoff-02`, exact commit `9c1da86c84af777d2a346215faf2a76bdbbd2b59` (same common PR #65 base as A).
- Branch B: `codex/knowledge-book-r2-r3-qa-isolated-01`.
- Independent A: [PR #66](https://github.com/joinLooper/looper/pull/66), `codex/app-art-integration-reform-01`. **B must not base on A, merge A, cherry-pick A, or write to A's branch**.
- Source archive R2/R3 `LOOPER_KNOWLEDGE_BOOK_R2_R3_COMBINED_REVIEW.zip`, SHA-256 `21636c0a0115ecb1107b7817aafa30e013b17c6341bc1dded51b02c623a60d72`.
- Library engineer handoff: `/Looper/Engineering/LOOPER_KNOWLEDGE_BOOK_R2_R3_APP_QA_HANDOFF_V1.zip`, Library `libfile_4df0975cb8b88191b47d5d4b075ccbfc`.
- R2 source is the book engineering foundation; R3 is review/5 paper-card states/food-waste illustration verification. Keep both source packages and SHAs separately.
- Missing genuine non-flattened book master: `ART_BLOCKED`. Never fabricate layers, art approval or final art.

## Strict file ownership (do not override A's parallel work)

B may CREATE/EDIT only:
- `apps/mobile/src/knowledge-book/**` (pure view/state/QA wrapper components with isolated exports)
- `apps/mobile/tests/knowledge-book-*.test.ts`
- `apps/mobile/scripts/knowledge-book-*.{mjs,py}`
- `apps/mobile/app/knowledge-book-qa.tsx` (unique **DEV/QA only** route, not the existing Forest `knowledge` route)
- `docs/qa/KNOWLEDGE_BOOK_R2_R3_PARALLEL_CODEX_LANE.md` (this checkpoint)
- `docs/qa/KNOWLEDGE_BOOK_R2_R3_QA_EVIDENCE.md` (only if actual checks and screenshots exist)

B MUST NOT EDIT in parallel:
- `apps/mobile/app/forest.tsx`, `apps/mobile/app/knowledge.tsx`, `apps/mobile/app/_layout.tsx`
- `apps/mobile/src/forest-ui.tsx`, `apps/mobile/src/model.ts`, `apps/mobile/src/state.tsx`
- `apps/mobile/package.json`, root `package.json`, lockfiles, shared types, shared QA scripts, `.github/workflows/**`
- `apps/api/**`, `packages/**`, `docs/authority/APP_ART_INTEGRATION_REFORM_01.md`, any `f1-my-forest-*` files
- all original Forest/HUD assets, any approved visual source files, and player ledgers

If a shared-file change becomes essential, STOP that specific change only: record `INTEGRATION_HOOK_REQUEST` with an exact proposed patch and expected test IDs in Issue #67. Do not make the edit. Central will authorize a one-time serialized integration **after** A freezes its corresponding entrypoint. The rest of B continues in isolated files.

## Engineering implementation target

1. Standalone DEV-only QA route/component: book intro → question → unanswered → option selection → correct/wrong → explanation → next question → close/back. Test tap behavior and return without touching Forest entrypoint.
2. Paper-card states in order `unanswered / selected / correct / incorrect / completed`; question, answer, explanation, Knowledge text, ⚡ indicator and counts are SYSTEM text, not baked PNG fields.
3. Daily questions 1–2 free; question 3 enters `ENERGY_POLICY_PENDING`. No guessed deduction/max quota and NO economy writes. Existing single-card `POST /player/knowledge-cards/:cardId/answers` is not the new multi-question policy; never call it in QA. Existing Lv3 knowledge entitlement remains unchanged.
4. R2+R3 source verification and `placement.json`, `state_manifest.json`, `hitbox.json`; preserve source bytes, store generated QA images locally only, not in public repo.
5. Run typecheck and tests with existing commands **without modifying package scripts**. Render **real runnable Expo Web** at both 9:16 and 9:19.5 if possible; composite reference pictures alone are not executable evidence. Mark each independent status correctly.

## Two independently isolated Windows Codex directories (example)

For A, **do not move or clean the existing dirty working folder**. For B, from a clean copy of the repository:

```powershell
git fetch origin
git worktree add ..\looper-knowledge-r2r3 codex/knowledge-book-r2-r3-qa-isolated-01
```

Only if Git refuses due to a checked-out branch, use `git worktree add -b codex/knowledge-book-r2-r3-local ..\looper-knowledge-r2r3 origin/codex/knowledge-book-r2-r3-qa-isolated-01` and push to the proper B branch via reviewed commits. Never `git reset --hard`, `git clean -fd`, `git stash pop` into an unrelated worktree, or force-push A. Do not start two agents on one worktree.

## Deliverable and merge gate

- B Draft PR targets `codex/f1-my-forest-info-handoff-02`, **not** A's branch or `main`. No auto-merge.
- Provide actual commits, changed-file whitelist check, tests, 9:16/9:19.5 screenshots, SHA proof and precise missing-art/policy blockers.
- Separately hand Central a minimal `INTEGRATION_HOOK_REQUEST` for Forest book open/close. Central schedules one tiny shared-file patch after A locks the entrypoint; no other shared-file changes.
- Both lines remain Draft; no production deployment, approved-art promotion or formal player-ledger changes.

## 2026-10-25 Windows B checkpoint

- Independent local worktree and branch established at B commit 623e17a74c96d527cab8539d0c98876e8895bd84. No A commits, shared Forest edits or package/lockfile changes.
- Isolated playable route /knowledge-book-qa, all five paper states, dynamic question data, same-day QA idempotency, Lv1/Lv3 fixtures and third-question policy stop implemented. No network/economy/persistent ledger dependency.
- Typecheck PASS; B tests 14/14 and importer safety 5/5 PASS; complete mobile suite 66 PASS / 0 FAIL / 1 pre-existing Python-launcher SKIP, with the equivalent AST check separately PASS.
- Real Expo Web 9:16 and 9:19.5 interactions PASS, 20 local screenshots, 17 measured taps per ratio, no page errors/asset failures/player API requests. The same-drive build mirror SHA-verifies 58 copied source/asset files; it does not change A's source or dependency files.
- Source ZIP bytes/actual R2-R3 art remain unavailable; ART_BLOCKED_NATIVE_BOOK_LAYERS_MISSING and ENERGY_POLICY_PENDING remain. No Final/Asset Ready/formal runtime/iPhone promotion.
- Actual evidence, source/bundle fingerprints, local screenshot locations and the exact un-applied INTEGRATION_HOOK_REQUEST are in [B QA evidence](KNOWLEDGE_BOOK_R2_R3_QA_EVIDENCE.md). Central alone connects the shared Forest hotspot after A freezes it.