# AUTH-01A.1 Legacy Admin Authorization Security Closure

**AUTH-01A.1 PASS — READY FOR CENTRAL REVIEW**

Source: codex/auth-01a-merchant-google-identity @ 7857f80e44ca7da906220395cc39e7abd2fb7f5f. Implementation: 3f4fce5781bfc9978b78a32a6dbd7aef93afe924. Target: codex/auth-01a1-platform-admin-guards. Draft PR: https://github.com/joinLooper/looper/pull/51. Final review SHA and verification of its Hosted CI are supplied by DELIVERY_VERSION.json in the complete verified ZIP. No merge.

## Result

All seven scoped admin routes now require an authenticated platform-purpose session, active account/membership and canonical backend permission, regardless of the Google flag. The approved branch-create permission belongs only to super_admin. Mutations validate exact Admin Origin and audit the session account. Legal GETs work without Origin. Shared logout now validates purpose-specific Origin before any revocation or cookie clearing.

## Validation

API 315, frontend 129 and PostgreSQL 44 = baseline 488. Independently: foundation 15; MVP load 48 scenarios; missions 4; player state 13; pure Energy extraction 2; legacy atomicity 14; AUTH-01A 34; web UI capture 24; new AUTH-01A.1 security 33. Frozen install, lint, typecheck, production build, full regression, isolated SQLite/PG validation, runtime browser capture, Hosted CI and Backend Tests passed. Raw commands, results, artifacts and logs are included. Final package verifies the review commit's hosted runs rather than reusing unrelated upstream results.

Implementation CI: https://github.com/joinLooper/looper/actions/runs/38562813702
Backend CI: https://github.com/joinLooper/looper/actions/runs/38562813502

## Changed files / reasons

- packages/types/src/index.ts: add the approved narrow permission; existing non-super role lists unchanged.
- docs/Admin/PERMISSION_MATRIX.md: document authority, scope and activation risk.
- apps/api/src/app.ts: seven route guards, canonical actors, flag-independent authority, logout CSRF.
- apps/api/src/app.test.ts: real session fixtures and required Origin; exact baseline/session deltas preserve race/rollback checks. All test names remain. Former insecure header-success assertion now requires denial.
- scripts/test-auth01a1.mjs: independent 33-test security matrix across both engines and flag states.
- package.json / .github/workflows/ci.yml: sustained security command, hosted step and artifact.
- docs/auth/AUTH01A1_*: audit and validation reports.

## Investigation history

The first closure attempt stopped correctly for missing permission. Central then approved platform.merchant_branch.create and platform scope. The original workspace was retained; a clean D-drive clone resolved fetch/disk constraints. Initial local regression exposed fixture-only issues: a header-negative case inadvertently received the new positive fixture, missing-session requests now correctly use the existing 401 contract, and new platform fixture rows affected old global counts. These were corrected with real identities, unchanged strict role denials and exact baseline-plus-one/no-addition assertions. An automatic review initially rejected an insufficiently justified assertion-edit batch; source and failure logs were inspected before a narrower evidenced fixture correction was accepted. No assertion was widened to accept successful unauthorized behavior. All discovery logs are retained.

## Scope / remaining risks

Store methods, database migrations/schema, Google verifier/binding/challenge/nonce/state, Async Player State, Economy and gameplay remain byte-identical to source (hash evidence). No historic transactions were repaired. Frontend product code, Forest, Treehouse and characters are unchanged. This is closure of the seven specified routes and logout, not certification of every legacy endpoint.

New branches remain active with can_redeem=1 and inherit existing settings; formal commercial onboarding/activation risk must be reviewed before merchant launch. No pending activation or second-person state machine was introduced. Real Google credentials/consent remain a separate gate. looper-site's missing apps/site deployment root remains an independent known issue. No Vercel settings, Supabase, Native App or AUTH-01B work occurred.

Stop for central review.
