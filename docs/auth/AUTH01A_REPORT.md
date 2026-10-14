# AUTH-01A Closure Report

**AUTH-01A PASS — READY FOR CENTRAL REVIEW**

Source branch: codex/w1c1-d-legacy-atomicity
Source HEAD: 0e65eccbb878d66daa9be4adcef3246db8ed33bd
Feature branch: codex/auth-01a-merchant-google-identity
Implementation HEAD: c6ab8b336603a98bdd14d0e0facb9b553f5497bd
Draft PR: https://github.com/joinLooper/looper/pull/50 (base: approved W1C1-D branch).
Final review/documentation HEAD and its complete CI are recorded in the ZIP DELIVERY_VERSION.json to avoid a self-referential Git SHA.

## Delivered behavior

Opt-in Google GIS ID-token login for merchant managers, bound to a verified Google sub and approved Looper invitation/account/membership. First binding, redemption, one-time challenge, session and audit are one transaction. Returning login uses the same account and preserves invitation provenance. No email auto-merge, new account database, automatic branch creation or merchant-to-platform privilege. Enabled mode blocks merchant bearer-only invite redemption. A necessary security closure also gates the three account/membership/invitation authority-minting POSTs with existing canonical Platform Session + identity permission + Admin Origin; supplied actorId is ignored in that mode. The default disabled path and Platform invitation redemption retain baseline behavior.

Explicit opt-in migration 28 preserves existing LINE identities/IDs and adds Google constraints plus hash-only challenge storage. Default baseline remains v27. The player verifier and runtime still accept LINE only. Configuration examples and explicit local migration command are included; enabling with missing configuration/schema or an insecure production origin fails closed.

## Validation

| Gate | Result |
|---|---|
| Frozen install / lint / typecheck / build | PASS |
| API / frontend / PG baseline | 315 / 129 / 44 = 488 PASS |
| Async Foundation | 15 PASS |
| True-concurrency MVP load | 48 scenarios PASS |
| Async Missions / Player State | 4 / 13 PASS |
| Energy Extraction / Legacy Atomicity | 2 / 14 PASS |
| AUTH-01A | 34 PASS, separately counted |
| Browser UI preview | 24 scenarios PASS |
| Existing runtime capture | PASS |
| PostgreSQL cleanup | PASS — stopped normally |
| Hosted CI | https://github.com/joinLooper/looper/actions/runs/38550351627 — PASS |
| Backend CI | https://github.com/joinLooper/looper/actions/runs/38550351625 — PASS |

All complete hosted checks above are tied to c6ab8b336603a98bdd14d0e0facb9b553f5497bd. Local full regression began at 9b0d688; the later guard/type/QA refinements are explicitly identified in FULL_REGRESSION.json. Current-code AUTH34 and serial closure checks pass. Final documentation commit receives another complete hosted run, recorded in the delivery. Initial implementation CI also passed; no failed assertions were deleted or relaxed.

## Evidence and iterations

Failure injection proves all affected auth tables roll back after each mutation, including after Audit. Nested outer rollback and lost-COMMIT-acknowledgement behavior are tested. Independent PG connections demonstrably wait simultaneously on the writer lock and create only one session. Security tests cover forged claims, nonce/state/browser/origin, expiry/replay, identity collisions, same email/different subject, revocation, cross-branch and Platform isolation, and forged admin provisioning.

Implementation harness corrections included Windows import URL normalization and returning auth error codes through the existing error handler. Adding the JWT dependency initially refreshed unrelated latest resolutions; these were reverted, with only jose retained in the lockfile. A stale local Fastify hoist was relinked to the pinned version. One post-closure parallel lint exhausted Windows process memory (exit 134); its raw log is preserved and the same checks passed serially. Hosted checks were not relaxed.

## Remaining rollout gates

No real Google OAuth client/credential or production consent flow has been configured/verified. Before activation: real client with exact authorized origin, same-site HTTPS deployment, browser/account/consent validation, and review of remaining legacy admin surfaces and inherited logout CSRF behavior. Challenge traffic controls remain a deployment/security task. Do not describe this package as live production Google login or comprehensive platform security certification. The synchronous PG adapter remains isolated parity infrastructure; no production PG integration or data migration occurred.

Feature disable intentionally restores legacy invite behavior; existing sessions are not mass-revoked but memberships remain checked. Audit/reconciliation instructions for unknown commit outcome are in CALL_GRAPH_AND_SECURITY_MODEL.md. No production data, historical ledger, Supabase, Native App, Gameplay/Economy, Forest/Treehouse or character work. PR #43–#49 remain unmerged. Stop for central review; AUTH-01B is not started.

## Changed files and reasons

- API verifier/auth/schema/migration modules: trusted Google verification, durable challenge, atomic binding, explicit schema extension.
- app.ts / store.ts: opt-in endpoints, cookie/origin/configuration gates, merchant bearer block and canonical admin provisioning in enabled mode.
- Shared types / player-identity.ts: Google identity and audit action types while retaining LINE-only player verification.
- Merchant login/invite/home/styles/config: minimal responsive Traditional Chinese flow and no-referrer handling; default invite redirect preserved.
- Package/lockfile: pinned jose only; separate auth test and explicit migration commands.
- Test/capture scripts and CI: 34 independent auth tests, PG race proof, 24 responsive preview states and hosted evidence.
- Documentation: security model, configuration/rollout limitations and evidence.

Files:
- .github/workflows/ci.yml
- apps/api/.env.merchant-google.example
- apps/api/package.json
- apps/api/src/app.ts
- apps/api/src/database.ts
- apps/api/src/merchant-google-auth.ts
- apps/api/src/merchant-google-schema.ts
- apps/api/src/merchant-google-verifier.ts
- apps/api/src/migrate-merchant-google.ts
- apps/api/src/player-identity.ts
- apps/api/src/store.ts
- apps/merchant/app/globals.css
- apps/merchant/app/google-login.tsx
- apps/merchant/app/invite/page.tsx
- apps/merchant/app/login/page.tsx
- apps/merchant/app/page.tsx
- apps/merchant/next.config.ts
- docs/auth/AUTH01A_CALL_GRAPH_AND_SECURITY_MODEL.md
- docs/auth/AUTH01A_REPORT.md
- package.json
- packages/types/src/index.ts
- pnpm-lock.yaml
- scripts/auth01a-race-worker.mjs
- scripts/capture-auth01a.mjs
- scripts/test-auth01a.mjs
