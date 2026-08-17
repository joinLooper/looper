## Welcome First Resident Demo v1.0 — Final Demo Closure v001

Central handoff status: `EXTERNAL_STATUS_CORRECTED_CENTRAL_REVIEW_PENDING`

### Fixed authority

- Base: `codex/welcome-first-resident`
- Base SHA: `1cf71f5580a8f234aa32131b8df77eaccb757701`
- Retained Reduced Motion commit: `204f731a55f843ba1306ee8418b2674b67af2429`
- Head: `codex/wfr-demo-v1-final-closure-v001`

### Closure

- Removed the Customer Support image layer, disabled entry, pending metadata, and pending guard from Demo v1.0 Settings.
- Retained the existing Settings layout, Reduced Motion, Replay, Logout, and Passed visual assets.
- Bound Reduced Motion release metadata to the exact Passed commit without reimplementing persistence.
- Set Release Blocker Count and Demo Scope Blocker Count to zero.
- Kept Production Release Ready false.
- Public Product Domain: `PUBLIC_PRODUCT_DOMAIN_REACHABLE` at `https://app.joinlooper.com/` (HTTP 200).
- Preview Protection: `NON_BLOCKING_PREVIEW_INFRA_NOTE`; the PR Preview remains Vercel Authentication protected and must not be promoted.
- Final Demo Production Deployment: `PENDING_AFTER_MERGE` using the existing Production Environment Authority.

### Local verification

- `pnpm test`: 315/315
- `pnpm lint`: 9/9
- `pnpm typecheck`: 9/9
- `pnpm build`: 9/9
- `pnpm qa:unified-runtime`: PASS
- Four required viewports: PASS
- Customer Support visible/executable/pending counts: 0/0/0
- Critical console errors: 0
- Broken images: 0

### LIFF configuration

Status: `LIFF_EXISTING_AUTHORITY_RECOVERED`.

- LIFF ID: `2010801374-9qYJqsDp`
- Endpoint Authority: `https://app.joinlooper.com/`
- Existing flow: `liff.init → liff.login → liff.getIDToken → POST /auth/player/line/session`
- Existing production LIFF and matching backend LINE Login Channel authority must be retained.
- LINE Channel Publication: `HUMAN_VERIFICATION_IF_NOT_MACHINE_VERIFIABLE`
- Account-level final QA: `PUBLIC_CHANNEL_AND_NON_TESTER_FINAL_QA_REQUIRED`

Release Blocker Count and Demo Scope Blocker Count remain zero. Demo Public Ready remains false only because the Final Demo production deployment and LINE public-channel final acceptance are pending after merge.

This PR is intentionally Draft. Do not merge and do not perform a Production Release before Central Final Demo Gate approval.
