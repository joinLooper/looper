# Welcome First Resident Demo v1.0 — Final Demo Closure v001

Status: `LOCAL_QA_PASSED — REMOTE_VALIDATION_PENDING`

## Authority

- Formal base SHA: `1cf71f5580a8f234aa32131b8df77eaccb757701`
- Reduced Motion retained SHA: `204f731a55f843ba1306ee8418b2674b67af2429`
- Closure branch: `codex/wfr-demo-v1-final-closure-v001`
- Customer Support: `REMOVED_FROM_DEMO_SCOPE`
- Release Blocker Count: 0
- Demo Scope Blocker Count: 0
- Production Release Ready: false
- Merge performed: no

## Runtime closure

Settings no longer renders the Customer Support asset layer, disabled entry, pending destination metadata, or pending placeholder. Reduced Motion, Replay, Logout, the Settings layout, and the Passed visual asset family are retained.

Looper Web and the Looper Game Web Runtime remain public and directly reachable. LIFF remains the primary game entry; no tester-only site, password, Vercel Protection, allowlist, or dual public/test runtime was introduced.

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

Status: `LIFF_ACCOUNT_CONFIGURATION_REQUIRED`.

Canonical LIFF initialization and ID-token-to-Player-Session flow remain present. The current runtime configuration has no `NEXT_PUBLIC_LINE_LIFF_ID`; clicking LINE entry reports `LINE LIFF 尚未設定`. Human LINE Developers configuration must provide only:

1. LIFF ID for the formal Looper LIFF app.
2. Matching LINE Login Channel ID for backend token verification.
3. Public Looper runtime Endpoint URL.
4. `openid` LIFF scope.

Remote GitHub Actions, the final branch Preview, HTTP 200, and public-access verification are recorded in the Draft PR and Central handoff after push.
