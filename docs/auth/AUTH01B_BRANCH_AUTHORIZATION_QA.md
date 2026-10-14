# Branch Authorization QA — preflight only

Canonical route chain: requireAuthenticatedMerchant → resolveAuthenticatedAccount → isMerchantOperatorSession → authorizeMerchant(accountId, merchantId) → getMerchantContext(accountId). Context aggregates all active account memberships and active brands. Routes without explicit merchantId (history/monthly report) also derive access from account-level context and need staff scope propagation after approval.

POST /merchant/task-code-submissions/:submissionId/decision uses this guard, exact merchant Origin, server accountId actor, then decideTaskCodeSubmission. No literal perform_branch_confirmation capability exists in current source; equivalent enforcement is branch membership authorization at this route. This report does not invent a new capability or alter settlement.

Probe: staff-only branch A gets A=200/B=403. Add valid brand_owner on B to same Account: same existing cookie gains B=200 and context exposes owner role. This is expected legacy aggregate behavior, not a claim that valid owner access was unauthorized. It conflicts with the NEW staff-only session requirement. Revoke staff A: A=403 but context and owner B remain 200.

Separate existing defect: GET /merchant/redemptions uses a client role header and global getter without Session. Evidence: AUTH01B_PREFLIGHT_RESULTS.json LEGACY_GLOBAL_REDEMPTION_READ (both engines). No production data was read.

New staff-only authorization negative tests, suspended/inactive branch cases, redemption decision attempts, staff-session revocation, scoped history/report filtering are NOT_IMPLEMENTED / BLOCKED_BY_PREFLIGHT. Existing purpose tests are diagnostics only.
