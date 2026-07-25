# Welcome First Resident v1.0

## Milestone identity

- Classification: **Private Resident Preview through Normal Public Entry**
- Target: **2026-08-30**
- Runtime baseline: `069f89d745660453821e9c0b8f8137eb2b95ead6`
- Starting documentation HEAD: `677acd3d515ccdd56b26314c92a79818efea708a`
- Starting branch: `codex/beta-closure-rc`
- Delivery branch: `codex/welcome-first-resident`

The earlier `Closed-Beta Preflight P0-1` batch was cancelled by product
direction change before Field QA. No Railway SSH key was registered and no
production database, restart, Merchant transaction, settlement, or ledger
drill was performed.

## Normal resident entry

The intended resident path is:

`LINE Official Account`
→ normal resident entry
→ LIFF / LINE Login
→ LINE consent
→ Looper Player
→ canonical resident
→ resident space

The resident must not be a LINE Developers Admin, Developer, Member, or Tester
and must not use a mock verifier, fixed `user-demo`, allowlist, invitation code,
development password, or test-only URL.

## LINE and LIFF starting state

The last accepted production evidence records:

- LINE Login Channel ID: `2010801374`
- Channel status: **Developing**
- LIFF ID: `2010801374-9qYJqsDp`
- LIFF endpoint: `https://app.joinlooper.com/`
- LIFF scopes: `openid`, `profile`
- Player production URL: `https://app.joinlooper.com/`

The current LINE Developers Console requires an authenticated operator session,
so the following values must be re-read in the console before resident
acceptance:

- current Channel status;
- LIFF app status and endpoint;
- LINE Login callback URL, if one is configured;
- scopes;
- Linked LINE Official Account.

The current Player uses LIFF initialization and an ID token rather than a
caller-provided identity. A redirect-based LINE Login callback is not part of
the current runtime flow.

### One required LINE Console operation

An authorized operator must sign in to LINE Developers Console, open provider
and LINE Login Channel `2010801374`, confirm the LIFF endpoint and scopes above,
confirm the intended LINE Official Account is shown under **Linked LINE
Official Account**, and change Channel status from **Developing** to
**Published**.

This publication is required before a normal user with no channel role can
authorize. LINE documents that publication cannot be reverted to Developing,
so it must be performed only after the Player preview deployment is ready for
resident acceptance.

## Resident Preview Mode

Player Preview Mode is controlled by one build-time setting:

```env
NEXT_PUBLIC_RESIDENT_PREVIEW_MODE=true
```

When enabled:

- Player login and canonical resident creation remain available;
- Player bootstrap reads the canonical resident state;
- restaurant missions and merchant lists are not loaded;
- restaurant entry remains visible but opens a resident-facing preparation
  notice;
- mission acceptance, task-code entry, submission, polling, settlement
  readback, and transaction recovery do not start;
- query parameters and caller input cannot turn the mode off;
- disabling the environment setting restores the existing Beta Candidate
  restaurant flow.

## Player route and entry audit

The Player is a single Next.js `/` route with internal resident screens.

| Entry                  | Preview result                                             |
| ---------------------- | ---------------------------------------------------------- |
| Resident space / home  | Available                                                  |
| My forest              | Available                                                  |
| Treehouse              | Available in the resident scene switcher                   |
| Today tasks            | Knowledge card available; restaurant entry visibly blocked |
| Weekly tasks           | Unified preparation notice                                 |
| Knowledge card         | Existing canonical experience                              |
| Star exchange          | Read-only balance and preparation state                    |
| Character selection    | Available in forest / treehouse                            |
| Forest care actions    | Unified preparation notice                                 |
| Inventory and vouchers | Read-only state or unified preparation notice              |
| Notifications          | Unified preparation notice                                 |
| Settings and logout    | Available                                                  |
| Merchant / Admin       | Not present in Player navigation                           |

## Acceptance gate

This milestone cannot pass until two normal, non-Tester LINE accounts complete
first login, repeat login, canonical resident isolation, iPhone LINE App
navigation, logout cleanup, and restaurant network-block verification against
the deployed Player preview.
