## Welcome First Resident Demo v1.0 — Final Demo Closure v001

Central handoff status: `LOCAL_QA_PASSED_REMOTE_VALIDATION_PENDING`

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
- Kept Looper Web public and directly reachable, with LIFF as the primary entry.

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

Status: `LIFF_ACCOUNT_CONFIGURATION_REQUIRED`.

The code retains canonical LIFF initialization, LINE Login, ID-token handoff, and backend Player Session verification. No credential was fabricated. Human configuration must supply the LINE Developers LIFF ID, matching LINE Login Channel ID, public Looper endpoint URL, and `openid` scope.

This PR is intentionally Draft. Do not merge and do not perform a Production Release before Central Final Demo Gate approval.
