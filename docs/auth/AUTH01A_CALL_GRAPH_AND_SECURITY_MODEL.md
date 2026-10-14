# AUTH-01A — Merchant Google identity and invite binding

Source: `codex/w1c1-d-legacy-atomicity` / `0e65eccbb878d66daa9be4adcef3246db8ed33bd` (PR #49 remains Draft/unmerged).

## Existing authority audit

| Entry | Existing authority | AUTH-01A change |
|---|---|---|
| POST /auth/invitations/redeem | Store transaction, hashed invitation, origin selected by invitation purpose, active account/membership, invitation-backed session, audit | Enabled Google rejects merchant-purpose bearer redemption inside transaction. Platform purpose unchanged. |
| GET /auth/session | Hash of HttpOnly session cookie; active account, expiry, revocation | Unchanged. Authentication is not sufficient authorization. |
| POST /auth/logout | Existing session revocation and cookie clear | Unchanged. |
| GET /merchant/context | Session purpose + active account/membership/brand; branches from membership | Unchanged; checked again on access. |
| Merchant branch operations | requireAuthenticatedMerchant → authorizeMerchant | Unchanged, no Google-supplied role/branch. |
| Platform operations | platform session purpose and backend permissions | Unchanged; merchant session denied even if account also has a platform membership. |

## New call chain

Merchant `/login` or `/invite` → server config → POST `/auth/merchant/google/challenge` → Google Identity Services (GIS) button callback → POST `/auth/merchant/google/session` → exact Origin + browser cookie/state check → `GoogleMerchantVerifier.verify` → `MerchantGoogleAuth.login` → transaction-scoped challenge/nonce recheck → existing account/invitation/membership → identity bind and invitation redeem (first login) → challenge consume → merchant Session → Audit → COMMIT → HttpOnly session cookie.

Returning login resolves `(google, verified sub)`, checks active account/manager membership and a redeemed, non-revoked merchant invitation belonging to that same account. It retains the existing session invitation foreign key; no fake invitation or new Account is created. A branch-staff-only account is not enrolled through this manager login package.

## Trust boundaries

- Only jose-verified RS256 ID tokens are accepted. The production JWKS URL is fixed to Google's HTTPS endpoint; untrusted `jku`/`x5u` are not followed. Issuer, client audience, exp, iat, sub, nonce, and optional azp are checked. Fetch timeout 5 seconds; bounded JWKS cache/refresh.
- GIS **JavaScript callback** flow, not authorization-code exchange: PKCE and OAuth redirect state are not applicable. An application state plus server-generated OIDC nonce and HttpOnly browser-secret cookie bind the callback to the initiating browser. Both POSTs require the exact merchant origin. Credentials are sent in JSON over HTTPS in production.
- The challenge table stores only hashes of state, nonce, browser secret and invitation token, plus expiry/consumption. Five-minute lifetime; expired rows pruned on challenge creation. Consumption is durable and transactional, shared across API instances; successful credentials cannot be replayed into another challenge because nonce differs.
- Invitation URL token is removed before any third-party script loads; merchant pages send Referrer-Policy: no-referrer. It is retained only in component memory for retry. No browser token storage or token logging.
- The verifier returns only verified subject/nonce. Email, name, accountId, role, merchantId and branchId never grant or resolve authority. Existing LINE Player verifier is narrowed to `provider: line` despite the shared provider union gaining Google.
- No cloud project, Google OAuth client, production database, or real credential was created/accessed. Public Web client ID is configuration, not an authorization grant.

## Transaction ownership and reconciliation

The new service uses unique SAVEPOINT names on the same synchronous PersistenceDatabase. SQLite SAVEPOINT is atomic and nesting-safe. The existing isolated PG bridge maps a root savepoint to BEGIN + the existing advisory writer lock, pins one connection, and commits at root RELEASE. Existing outer transactions retain ownership. No asynchronous provider call occurs inside the write transaction.

Every pre-commit fault rolls back identity binding, invitation redemption, challenge consumption, session insertion and audit. A failed root RELEASE has `GOOGLE_COMMIT_OUTCOME_UNKNOWN`: connection is closed, no successful cookie returned, no automatic retry. Test coverage explicitly simulates a committed transaction with a lost acknowledgement and proves the challenge remains consumed. Reconciliation uses hashed challenge state → consumed_at, invitation status, provider binding and session audit (account/session/invitation IDs). Do not recreate or repair data automatically. Support may query these records; a new, explicitly initiated returning login can issue a separate session once binding is confirmed. The UI suppresses retry for the explicit unknown-outcome error.

## Schema and rollout

Opt-in migration **28 / merchant_google_identity_opt_in** extends the existing identity table CHECK to line/google, preserves all IDs and existing `(provider, provider_subject)` uniqueness, and adds a partial unique Google-account index. SQLite copies/replaces only this unreferenced child table within a transaction; PG alters its provider CHECK in place. It adds only the transient challenge table; no second account database. Tests exercise both engines, pre-existing LINE identities, migration idempotence and unsupported-provider rejection.

Baseline `migrateDatabase` stays v27 while Google is disabled. Migration 28 is explicitly reserved in source; future baseline migrations must begin at 29 and preserve this extension. The production enablement path requires its schema_migrations marker and never silently runs DDL. Turning the flag off does not remove bindings or drop tables. Existing SQLite/PG schema artifacts remain historical v27 evidence.

Local SQLite: set `LOOPER_DATABASE_PATH` to an explicit disposable path; run `pnpm auth:google:migrate` (no seed). Set `LOOPER_MERCHANT_GOOGLE_ENABLED=true`, `GOOGLE_MERCHANT_CLIENT_ID` and exact `LOOPER_MERCHANT_APP_URL`. Default is false. Missing client/origin/schema, invalid flag spelling, non-HTTPS production origin or an injected production verifier fail startup. Tests use in-memory SQLite and isolated PG17, ephemeral RSA keys with a local JWKS resolver; there is **no runtime fake-token environment switch**. PG migration is called explicitly only by the isolated parity harness; this package does not enable a production PG deployment.

Before real rollout: configure a real Google Web client and its exact authorized JavaScript origin; deploy API and merchant Web on compatible same-site HTTPS origins for existing SameSite=Lax cookies; run real browser/account/consent tests. No dynamic redirect URI is accepted. GIS script is official; Google access/refresh tokens and client secrets are not used.

## Remaining pre-production boundaries

Existing header-based legacy admin creation routes and logout CSRF behavior are inherited and not security-upgraded in this scoped package; do not interpret AUTH-01A as production-wide authentication hardening. Challenge issuance currently relies on deployment-level traffic controls; no broad rate-limiting system was added. The synchronous PG bridge remains isolated parity infrastructure. Existing already-issued merchant sessions are not mass-revoked by flag enablement, but their permissions remain checked at access time. No historical identity/ledger repair or automatic account merge.

References: [Google server verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [GIS JavaScript API](https://developers.google.com/identity/gsi/web/reference/js-reference). Reviewed 2026-10-14; links describe provider protocol, not evidence of live Looper login.
