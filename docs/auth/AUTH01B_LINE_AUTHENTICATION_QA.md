# LINE Authentication / Invitation Atomicity QA

Status: BLOCKED_BY_PREFLIGHT. No new staff verifier or OAuth routes exist. No production credentials requested, no real provider token sent.

Existing Player verifier reviewed for official verify endpoint, issuer, audience, expiry and subject. Synthetic fixture verifier used ONLY for isolated current-route diagnostics. It is not evidence that LINE Staff verification is implemented.

Not run / not implemented: staff verified-invalid token, issuer/audience/expiry, state/nonce/CSRF, replay, concurrent invitation redemption, binding audit rollback, unknown commit outcome, returning staff login. Existing Google tests cannot stand in for these gates.

Existing invitation-only redemption was used solely to construct a legitimate current merchant Session fixture. It is NOT the proposed staff authentication mechanism. Its generic purpose and missing provider/scope binding are D2 review inputs.

Mobile Web Preview: NOT_IMPLEMENTED. No 9:16 / 9:19.5 / desktop staff screenshots are supplied; START_HERE.html is an engineering evidence index, not a merchant UI prototype. Existing merchant UI remains unchanged. After approval implement minimal Traditional Chinese login/invite/conflict/expired/revoked/success/branch/logout states and verify all sizes.

