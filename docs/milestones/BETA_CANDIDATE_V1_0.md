# Beta Candidate v1.0

## Milestone

- Date: `2026-07-25`
- Status: **Approved**
- Release classification: **Beta Candidate**
- Production Ready: **No**
- Build ID: `looper-beta-rc-20260725-02-069f89d`
- Executable source SHA: `069f89d745660453821e9c0b8f8137eb2b95ead6`
- Stacked Draft PR: [#31](https://github.com/joinLooper/looper/pull/31)

## Core meaning

Looper has completed its first real LINE-account milestone across LIFF, production
HTTPS domains, canonical player identity, Player Session isolation, and persistent
production data.

Two real LINE accounts successfully authenticated and resolved to distinct
canonical players. Each account received its own Player HttpOnly Session and
loaded its own player home. The production identity chain did not fall back to the
historical fixed `user-demo` identity.

## Production services

- Player: [app.joinlooper.com](https://app.joinlooper.com)
- Merchant: [merchant.joinlooper.com](https://merchant.joinlooper.com)
- Admin: [admin.joinlooper.com](https://admin.joinlooper.com)
- API: [api.joinlooper.com](https://api.joinlooper.com)

## Technical chain

```text
LINE
→ LIFF
→ Vercel Player Web
→ Railway API
→ Player HttpOnly Session
→ canonical account
→ canonical player
→ SQLite persistent volume
```

## Approval matrix

| Gate | Status |
|---|---|
| Deployment | Passed |
| LINE Login | Passed |
| Account A | Passed |
| Account B | Passed |
| Identity separation | Passed |
| Beta Candidate | Approved |
| Production Ready | No |

## Post-Beta work

- Run real Player/Merchant task-code field testing.
- Complete site-wide UI ratio calibration.
- Establish closed-beta data backup operations.
- Migrate production data infrastructure to PostgreSQL.
- Decide when to publish the LINE Login Channel.
- Converge the stacked PRs into the mainline with a dedicated Preflight.
