# Welcome First Resident Demo v1.0 — Unified Integration Report v001

Status: `FINAL_P0_WIRING_LOCAL_VALIDATION_PASSED_CI_PENDING`

## Fixed authority

- Repository: `joinLooper/looper`
- Integration branch: `codex/wfr-demo-v1-unified-integration-v001`
- Baseline: `55abfee7d8f65c72e30e9ab5f85519a27230bad4`
- Previous integration head: `362eb5d59be64d570c039994646ad3a18bd354ee`
- Retained backend authority: `d8c332c30578a628dc7d8f544a6c0a9cb527c30e`
- Formal Source Gate: 9/9 passed

The existing branch was fast-forwarded to the exact approved backend commit. No new branch, squash, rebase, cherry-pick, backend rewrite, Passed Asset edit, Canon edit, or release-gate self-release occurred.

## Final P0 Mission Claim wiring

Today Slot 1 remains `resident-daily-arrival` / `今日來訪`: completed, not claimable, and zero Stars, EXP, Energy, CO₂e, and items.

Today Slot 2 is `resident-daily-core-tree-check` / `看看今天的森林`. An authenticated resident completes it by opening Core Tree that Asia/Taipei business day. Its only reward is 10 Stars.

The presentation and orchestration now cover:

`AVAILABLE → COMPLETED → CLAIMABLE → CLAIM_REQUEST → CLAIM_PENDING → BACKEND_SUCCESS → CLAIMED`

The formal control calls only `POST /player/missions/instances/:instanceId/claim` with `{idempotencyKey}`. A synchronous in-flight lock prevents double submission. The same unresolved attempt reuses the same opaque key. Pending renders neither a stamp nor optimistic Stars. Success reconciles the authoritative profile and read model before the backend-gated stamp and Stars HUD receiving state. Failure refreshes backend truth, preserves the key for safe retry, or reconciles an already-claimed conflict.

## Runtime and guards

One Global HUD and one Global Focus Manager remain authoritative across Forest and Treehouse. Dialogue, Resources, Mission, Knowledge, Settings, Reward destinations, Restaurant locked preview, and Core Tree remain integrated. UG-01 through UG-14 pass. The sole Non-Merchant Mission Claim P0 route count is one; Merchant Mission, Restaurant transaction, P1 store/inventory/chest, legacy reward, Bottom Navigation, and proxy-character executable counts remain zero.

## Verification

- Tests: 309 passed, 0 failed
- Lint: 9/9 packages
- Typecheck: 9/9 packages
- Production build: 9/9 packages
- Unified static guard and compatibility QA: PASS
- Browser: claim success, double-click, deterministic pending, failure, same-key retry, multi-device conflict, reload, relogin, Reduced Motion, and scene switch all PASS
- Responsive: 390×844, 375×667, 1280×720, and 1440×900 PASS
- Critical console errors: 0
- Broken runtime images: 0

## Release blocker register

Production Release Ready remains false:

1. Reduced Motion durable persistence authority is pending.
2. Customer Support destination is pending.

Integration merge blocker count is zero, but Central approval remains required. No merge was performed.
