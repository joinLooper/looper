# AUTH-01A.1 Admin Route Audit

Source 7857f80e44ca7da906220395cc39e7abd2fb7f5f; implementation 3f4fce5781bfc9978b78a32a6dbd7aef93afe924. PR #51 is Draft / Unmerged.

| Route | Canonical permission | Origin | Actor / scope |
|---|---|---|---|
| POST /admin/merchant-brands/:brandId/branches | platform.merchant_branch.create | exact Admin | Session account; active target brand, existing platform scope |
| GET /admin/accounts | platform.identity.manage | not required | Platform identity reads |
| GET /admin/merchant-operator-memberships | platform.identity.manage | not required | Required brand filter; platform scope |
| GET /admin/reports/task-code/monthly-live | platform.reporting.read | not required | Platform reporting with existing brand/merchant filters |
| POST /admin/accounts | platform.identity.manage | exact Admin | Session account |
| POST /admin/merchant-operator-memberships | platform.identity.manage | exact Admin | Session account; target account/brand/merchant relationships |
| POST /admin/account-invitations | platform.identity.manage | exact Admin | Session account; existing invitation eligibility/purpose |

## Authority

Both Google flag modes use resolvePlatformOperatorContext → canonical cookie token → unexpired/unrevoked active account → platform session purpose → active platform membership → role-derived permissions. No supplied role/permission header grants authority. POST preValidation rejects invalid Origin/authority before body validation and stores; actorId remains accepted in the old request shape but is ignored for authority and replaced by the authenticated account. GETs retain legal requests without Origin.

The centrally approved platform.merchant_branch.create is appended to PLATFORM_PERMISSIONS; super_admin inherits it. Exact operations_admin / finance_admin lists are unchanged and tested. Merchant memberships never add platform permissions. No new role or per-brand Platform Assignment exists. An authorized super_admin may create branches in different active brands.

## Resource validation and preserved business behavior

The unchanged Store verifies brand existence, rejects suspended brands (the schema only allows active/suspended), constrains branch brandId through the route/insert and foreign key, and enforces branch-code uniqueness / payload-bound replay. Membership writes retain merchant-to-brand verification and database constraints in both engines. GET filters do not constitute authorization; they narrow an already authorized platform query. A brand/merchant mismatch yields no cross-brand data under the existing conjunctive filters.

New branches still become status=active and can_redeem=1 and inherit existing settings. This package does not add activation review or second-person approval; commercial onboarding and immediate redemption risk require separate approval before merchant launch.

## Test authority

33 independently counted security tests cover every route with missing/forged/expired/revoked/inactive authority, all four merchant roles, player purpose, overlapping merchant/platform identities, insufficient roles, POST Origin, no-Origin GET, canonical audit actor, brand relationships, replay and logout. Denial checks compare complete baseline table snapshots to prove no writes. Existing 315 API cases retain their names; successful legacy fixtures now create a real platform session. A former header-only success becomes a strict 401 rejection. Missing-session GET cases use the existing canonical 401 contract, while valid wrong-purpose sessions assert 403.
