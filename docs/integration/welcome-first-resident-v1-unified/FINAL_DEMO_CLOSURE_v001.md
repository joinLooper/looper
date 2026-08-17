# Welcome First Resident Demo v1.0 — Final Demo Closure v001

Status: `EXTERNAL_STATUS_CORRECTED — CENTRAL_REVIEW_PENDING`

## Authority

- Formal base SHA: `1cf71f5580a8f234aa32131b8df77eaccb757701`
- Reduced Motion retained SHA: `204f731a55f843ba1306ee8418b2674b67af2429`
- Closure branch: `codex/wfr-demo-v1-final-closure-v001`
- Customer Support: `REMOVED_FROM_DEMO_SCOPE`
- Release Blocker Count: 0
- Demo Scope Blocker Count: 0
- Production Release Ready: false
- Demo Public Ready: false
- Merge performed: no

## Runtime closure

Settings no longer renders the Customer Support asset layer, disabled entry, pending destination metadata, or pending placeholder. Reduced Motion, Replay, Logout, the Settings layout, and the Passed visual asset family are retained.

The formal product domain `https://app.joinlooper.com/` is `PUBLIC_PRODUCT_DOMAIN_REACHABLE` and returns HTTP 200. LIFF remains the primary game entry; no tester-only site, test account, allowlist, or dual public/test runtime was introduced.

The current PR Preview is protected by Vercel Authentication. This is a `NON_BLOCKING_PREVIEW_INFRA_NOTE`, not a Demo Release, public website, or product access blocker. The protected Preview must not be promoted because the Final Demo production deployment must use the existing Production Environment Authority after merge.

## Verification

- Tests: 315/315
- Lint: 9/9
- Typecheck: 9/9
- Build: 9/9
- Unified QA: PASS
- Customer Support visible count: 0
- Support executable route count: 0
- Support pending placeholder count: 0
- Required responsive viewports: PASS
- Forest, Treehouse, Mission, Knowledge, Settings, Reward, Restaurant locked preview, Reduced Motion, Login, Logout, Global HUD, and Global Focus: PASS
- Critical console errors: 0
- Broken images: 0

## LIFF

Status: `LIFF_EXISTING_AUTHORITY_RECOVERED`.

The existing production authority must be retained:

- LIFF ID: `2010801374-9qYJqsDp`
- Endpoint Authority: `https://app.joinlooper.com/`
- Production flow: `liff.init → liff.login → liff.getIDToken → POST /auth/player/line/session`
- Existing backend matching LINE Login Channel authority remains unchanged.

No new LIFF, Channel, Channel ID, or credential is required or authorized. LINE Channel publication remains `LINE_CHANNEL_PUBLICATION_HUMAN_VERIFICATION_REQUIRED` when it cannot be machine-verified.

## Remaining external acceptance

- Final Demo Production Deployment: `PENDING_AFTER_MERGE`
- LINE public-channel final acceptance: `PUBLIC_CHANNEL_AND_NON_TESTER_FINAL_QA_REQUIRED`

These are not implementation blockers. Demo Public Ready remains false only because the Final Demo has not yet been deployed to the formal public domain and LINE public-channel final acceptance is not complete.
