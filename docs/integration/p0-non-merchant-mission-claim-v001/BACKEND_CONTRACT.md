# P0 Non-Merchant Mission Claim Backend Contract v001

Authority timezone: `Asia/Taipei`

Frozen mission:

- Mission ID: `resident-daily-core-tree-check`
- Name: `看看今天的森林`
- Kind: `non_merchant`
- Completion truth: an authenticated resident opens the Core Tree world interaction once during the current business date
- Reward: exactly 10 Stars on claim; EXP, Energy, CO₂e, items, and growth are all zero

## Persistent authority

`resident_mission_instances` has one row at most for `(user_id, mission_id, business_date)`. It stores the instance identity, resident, mission, business date, state, completion truth and timestamp, claim state and timestamp, and Reward Event link.

Supported mission states are `AVAILABLE`, `IN_PROGRESS`, `COMPLETED`, `CLAIMABLE`, `CLAIM_PENDING`, and `CLAIMED`. The Core Tree flow persists `AVAILABLE`, `CLAIMABLE`, the transactional `CLAIM_PENDING`, and `CLAIMED`; completion and claim are also independently represented by `completion_state` and `claim_state`.

`resident_mission_claim_requests` binds each resident-scoped idempotency key to one instance fingerprint and stores the original authoritative successful result for replay. Its flow states are `REQUEST`, `BACKEND_SUCCESS`, and `FAILURE`. Failed transactions roll back the request row, mission transition, ledger, balance, and audit together.

## Runtime read model

`GET /player/missions/runtime`

Authentication: player Session cookie.

The backend derives the resident and Taiwan business date. `today[0]` remains `resident-daily-arrival`, completed, reward zero, and not claimable. `today[1]` is the Core Tree mission and includes `instanceId`, mission metadata, business date, authoritative states and timestamps, completion truth, the 10-Star preview, and claim interaction eligibility. `weekly` remains the existing empty preview authority.

## Core Tree completion

`POST /player/world/core-tree/interactions/open`

Request body:

```json
{}
```

The request contains no resident, reward, business date, or claim truth. The player Session determines the resident and the backend determines the Taiwan date. The first request moves the daily instance to completed and claimable. Later requests return the same instance with `replayed: true`. Completion creates no Reward Event or resource transaction.

## Claim

`POST /player/missions/instances/:instanceId/claim`

Request body:

```json
{
  "idempotencyKey": "client-generated-opaque-key"
}
```

No resident, reward amount, claimability, or business date is accepted from the client.

Success is `201`; a same-key, same-instance replay is `200`. The response includes the claimed mission instance, an exact zero-or-10 reward result, authoritative player balances, the Reward Event identity, and `replayed`.

A same-key/different-instance request, an incomplete or stale-date instance, and a new key after claim return `409`. A cross-resident instance is returned as `404` and does not reveal ownership.

## Atomic Reward Ledger binding

Claim executes under `BEGIN IMMEDIATE` and performs ownership, date, completion, claimability, prior-claim, and idempotency checks before granting. It maps the formal authority source `non_merchant_mission_claim` to the existing `task_completion` Reward Event family. The authoritative source identity is the mission instance ID and the formal source is retained in both `reward_events.logical_request_json` and the Stars resource transaction metadata.

The transaction creates at most one Reward Event and one 10-Star resource grant for an instance, updates the Stars balance, marks the instance claimed, binds `reward_event_id`, saves the original replay result, writes the audit event, and commits. The mission claim opts out of growth settlement entirely, so it cannot convert pre-existing carbon, seeds, or plants and cannot change growth version or balances.

## Frontend boundary

Opening the existing Core Tree world object calls the completion endpoint with an empty body. Mission state continues to come from the runtime read model. No new reward modal, card, toast wall, settlement card, merchant dependency, inventory, item, or currency is introduced.
