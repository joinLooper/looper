# AUTH-01A.1 Logout CSRF Review

## Before

POST /auth/logout consumed looper_session and revoked it without checking Origin. SameSite=Lax limits cookie transmission for truly cross-site POSTs, but is not sufficient protection against same-site cross-origin requests. The finding was an application-layer missing Origin guard; no claim is made that every cross-site request carried a cookie.

## After

Before revocation or cookie clearing, Origin must exactly match a configured Admin or Merchant origin. For a valid platform-purpose session, requireAdminOrigin must pass; for a merchant-purpose session, requireMerchantOrigin must pass. A player-purpose token supplied in the shared cookie is denied. Missing/null/foreign/non-exact origins and origin-purpose mismatch are denied with 403 and leave both data and cookies untouched.

Expired/revoked/missing tokens do not revoke another session: a request from either configured frontend may preserve the existing idempotent cookie-clearing response. Valid-session logout remains transactional; audit failure rolls back revocation. Existing frontend fetch(method POST, credentials include) already supplies its browser Origin and needs no UI change.

## Preserved contracts

200 {authenticated:false}, HttpOnly, Path=/, SameSite=Lax, production Secure and Max-Age=0 clearing are preserved. Issuance cookie TTL, token expiration, session purposes, Google JWT/binding/challenge/nonce/state and existing logout Store method are unchanged. Existing API production Secure/TTL tests still pass.

## Evidence

The logout security group runs on SQLite and PostgreSQL with Google ON and OFF: Admin/Merchant origin matching, foreign/missing/null/prefix/path origins, purpose isolation, successful logout, replay, no-session clearing, and injected audit rollback. All groups pass and compare full snapshots on rejected requests. Tests use isolated sessions; real Google credentials/consent remain a separate release gate.
